import { GoogleGenAI } from "@google/genai";
import { montarPrompt } from "../prompts/classification.js";
import {
  GEMINI_MODEL,
  GEMINI_MAX_RETRIES,
  GEMINI_RETRY_FALLBACK_MS,
  GEMINI_API_KEY,
  FOLDER_SPAM,
  FOLDER_MUITO_IMPORTANTE,
  FOLDER_IMPORTANTE,
  FOLDER_POUCO_IMPORTANTE,
} from "../config/env.js";

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
});

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function obterTextoResposta(response) {
  if (response?.text) {
    return response.text;
  }

  const textoCandidato =
    response?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("") || "";

  return textoCandidato;
}

function extrairJson(texto) {
  const limpo = String(texto || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const inicio = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");

  if (inicio === -1 || fim === -1 || fim <= inicio) {
    throw new Error("A resposta da IA não contém JSON válido.");
  }

  return JSON.parse(limpo.slice(inicio, fim + 1));
}

function normalizarBoolean(valor, padrao = false) {
  if (typeof valor === "boolean") {
    return valor;
  }

  if (typeof valor === "string") {
    const normalizado = valor.trim().toLowerCase();

    if (["true", "sim", "yes", "1"].includes(normalizado)) {
      return true;
    }

    if (["false", "não", "nao", "no", "0"].includes(normalizado)) {
      return false;
    }
  }

  return padrao;
}

function normalizarPrioridade(valor) {
  const prioridade = String(valor || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

  const prioridadesValidas = [
    "SPAM",
    "MUITO_IMPORTANTE",
    "IMPORTANTE",
    "POUCO_IMPORTANTE",
  ];

  if (prioridadesValidas.includes(prioridade)) {
    return prioridade;
  }

  return "IMPORTANTE";
}

function normalizarRisco(valor) {
  const risco = String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (["alto", "medio", "baixo"].includes(risco)) {
    return risco;
  }

  return "medio";
}

function pastaPorPrioridade(prioridade) {
  if (prioridade === "SPAM") {
    return FOLDER_SPAM;
  }

  if (prioridade === "MUITO_IMPORTANTE") {
    return FOLDER_MUITO_IMPORTANTE;
  }

  if (prioridade === "IMPORTANTE") {
    return FOLDER_IMPORTANTE;
  }

  return FOLDER_POUCO_IMPORTANTE;
}

function normalizarResultado(resultado) {
  const prioridade = normalizarPrioridade(resultado.prioridade);
  const risco = normalizarRisco(resultado.risco_se_nao_agir);

  const precisaAcaoDireta = normalizarBoolean(
    resultado.precisa_acao_direta,
    false
  );

  return {
    prioridade,
    precisa_acao_direta: prioridade === "SPAM" ? false : precisaAcaoDireta,
    risco_se_nao_agir: prioridade === "SPAM" ? "baixo" : risco,
    motivo:
      resultado.motivo ||
      "A IA não retornou um motivo detalhado para a classificação.",
    pasta_sugerida: pastaPorPrioridade(prioridade),
  };
}

function tentarParseJsonErro(error) {
  const mensagem = String(error?.message || "");

  try {
    return JSON.parse(mensagem);
  } catch {
    return null;
  }
}

function erroTemporarioGemini(error) {
  const textoErro = String(error?.message || "").toLowerCase();
  const jsonErro = tentarParseJsonErro(error);

  const codigo = Number(jsonErro?.error?.code);
  const status = String(jsonErro?.error?.status || "").toLowerCase();

  return (
    codigo === 429 ||
    codigo === 503 ||
    status.includes("resource_exhausted") ||
    status.includes("unavailable") ||
    textoErro.includes("429") ||
    textoErro.includes("503") ||
    textoErro.includes("resource_exhausted") ||
    textoErro.includes("quota exceeded") ||
    textoErro.includes("rate limit") ||
    textoErro.includes("unavailable") ||
    textoErro.includes("high demand") ||
    textoErro.includes("try again later")
  );
}

function extrairRetryDelayMs(error) {
  const jsonErro = tentarParseJsonErro(error);
  const detalhes = jsonErro?.error?.details || [];

  const retryInfo = detalhes.find((item) => {
    return String(item?.["@type"] || "").includes("RetryInfo");
  });

  const retryDelay = retryInfo?.retryDelay;

  if (retryDelay) {
    const segundos = Number(String(retryDelay).replace("s", ""));

    if (!Number.isNaN(segundos) && segundos > 0) {
      return segundos * 1000;
    }
  }

  const textoErro = String(error?.message || "");
  const match = textoErro.match(/retry in\s+([\d.]+)s/i);

  if (match) {
    const segundos = Number(match[1]);

    if (!Number.isNaN(segundos) && segundos > 0) {
      return segundos * 1000;
    }
  }

  return GEMINI_RETRY_FALLBACK_MS;
}

async function gerarConteudoComRetry(prompt) {
  for (let tentativa = 0; tentativa <= GEMINI_MAX_RETRIES; tentativa++) {
    try {
      return await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      });
    } catch (error) {
      const ultimaTentativa = tentativa >= GEMINI_MAX_RETRIES;

      if (!erroTemporarioGemini(error) || ultimaTentativa) {
        throw error;
      }

      const esperaMs = extrairRetryDelayMs(error) + 2000;

      console.log(
        `Gemini temporariamente indisponível ou em limite. Aguardando ${Math.ceil(
          esperaMs / 1000
        )}s antes de tentar novamente...`
      );

      await aguardar(esperaMs);
    }
  }

  throw new Error("Não foi possível obter resposta do Gemini após as tentativas.");
}

export async function classificarComGemini(email) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY não configurada no .env");
  }

  const prompt = montarPrompt(email);
  const response = await gerarConteudoComRetry(prompt);

  const texto = obterTextoResposta(response);

  if (!texto) {
    throw new Error("O Gemini retornou uma resposta vazia.");
  }

  const json = extrairJson(texto);
  const resultado = normalizarResultado(json);

  return {
    modelo: GEMINI_MODEL,
    resultado,
  };
}

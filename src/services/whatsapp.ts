import axios from "axios";
import { promises as fs } from "fs";
import { dirname, resolve, isAbsolute } from "path";
import { fileURLToPath } from "url";
import {
  WHATSAPP_ENABLED,
  WHATSAPP_USE_TEMPLATE,
  WHATSAPP_SAVE_MESSAGES,
  WHATSAPP_API_VERSION,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_TO,
  WHATSAPP_TEMPLATE_NAME,
  WHATSAPP_TEMPLATE_LANGUAGE,
  WHATSAPP_MAX_EMAILS_PER_MESSAGE,
  WHATSAPP_MAX_TOTAL_MESSAGES,
  WHATSAPP_TEMPLATE_RESUMO_LIMIT,
  WHATSAPP_TEXT_LIMIT,
  WHATSAPP_MESSAGE_LOG_FILE as WHATSAPP_MESSAGE_LOG_FILE_RAW,
} from "../config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function resolverCaminhoLogWhatsApp() {
  const caminhoEnv = WHATSAPP_MESSAGE_LOG_FILE_RAW || "./whatsapp_messages_log.txt";

  if (isAbsolute(caminhoEnv)) {
    return caminhoEnv;
  }

  // Volta duas pastas pois estamos em src/services
  return resolve(__dirname, "../../", caminhoEnv);
}

const WHATSAPP_MESSAGE_LOG_FILE = resolverCaminhoLogWhatsApp();

function limparTextoBasico(texto, limite = 950) {
  const limpo = String(texto || "")
    .replace(/\s+/g, " ")
    .trim();

  return limpo.length > limite ? limpo.slice(0, limite) + "..." : limpo;
}

function limparParametroTemplate(texto, limite = 900) {
  const limpo = String(texto || "")
    .replace(/[\n\r\t]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return limpo.length > limite ? limpo.slice(0, limite) + "..." : limpo;
}

function dividirEmBlocos(lista, tamanho) {
  const blocos = [];

  for (let i = 0; i < lista.length; i += tamanho) {
    blocos.push(lista.slice(i, i + tamanho));
  }

  return blocos;
}

function montarItemResumo(email, index) {
  const assunto = limparTextoBasico(email.assunto, 90);
  const remetente = limparTextoBasico(email.remetente, 90);
  const motivo = limparTextoBasico(email.motivo, 120);

  return {
    assunto,
    remetente,
    motivo,
    textoMultilinha: `${index + 1}. ${assunto}
De: ${remetente}
Motivo: ${motivo}`,
    textoTemplate: `${index + 1}. ${assunto} | De: ${remetente} | Motivo: ${motivo}`,
  };
}

export function montarResumoWhatsApp(emails, estatisticas = null) {
  const totalEmailsMuitoImportantes = emails.length;

  if (!totalEmailsMuitoImportantes) {
    return [];
  }

  const tamanhoBloco = Math.max(1, WHATSAPP_MAX_EMAILS_PER_MESSAGE);
  const maxMensagens = Math.max(1, WHATSAPP_MAX_TOTAL_MESSAGES);

  const blocos = dividirEmBlocos(emails, tamanhoBloco).slice(0, maxMensagens);
  const totalBlocosGerados = Math.ceil(totalEmailsMuitoImportantes / tamanhoBloco);
  const totalBlocosEnviados = blocos.length;
  const houveCorte = totalBlocosGerados > totalBlocosEnviados;

  return blocos.map((bloco, blocoIndex) => {
    const parteAtual = blocoIndex + 1;
    const itens = bloco.map((email, index) => {
      const numeroGlobal = blocoIndex * tamanhoBloco + index;
      return montarItemResumo(email, numeroGlobal);
    });

    const resumoTemplateBase = itens
      .map((item) => item.textoTemplate)
      .join(" || ");

    const complementoCorte =
      houveCorte && blocoIndex === blocos.length - 1
        ? ` || Existem mais e-mails muito importantes não enviados no WhatsApp. Verifique a pasta "1 - Muito importante".`
        : "";

    const resumoEstatisticas = estatisticas
      ? `Processados: ${estatisticas.processados} | Muito importantes: ${estatisticas.muito_importante} | Importantes: ${estatisticas.importante} | Pouco importantes: ${estatisticas.pouco_importante} | Spam: ${estatisticas.spam}`
      : `Muito importantes: ${totalEmailsMuitoImportantes}`;

    const resumoTemplate = limparParametroTemplate(
      `${resumoEstatisticas} || Parte ${parteAtual}/${totalBlocosGerados} || ${resumoTemplateBase}${complementoCorte}`,
      WHATSAPP_TEMPLATE_RESUMO_LIMIT
    );

    const resumoMultilinha = itens
      .map((item) => item.textoMultilinha)
      .join("\n\n");

    const textoLivre = limparTextoBasico(
      `Resumo de e-mails classificados como muito importantes.

${resumoEstatisticas}

Parte ${parteAtual}/${totalBlocosGerados}

Resumo:
${resumoMultilinha}

${
  houveCorte && blocoIndex === blocos.length - 1
    ? `Atenção: existem mais e-mails muito importantes não enviados no WhatsApp por limite de mensagens. Verifique a pasta "1 - Muito importante".`
    : `Verifique a pasta "1 - Muito importante" no Outlook.`
}`,
      WHATSAPP_TEXT_LIMIT
    );

    return {
      quantidade: String(totalEmailsMuitoImportantes),
      resumo: resumoTemplate,
      textoLivre,
      parte_atual: parteAtual,
      total_partes: totalBlocosGerados,
      houve_corte: houveCorte,
    };
  });
}

function montarPayloadTexto(mensagem) {
  return {
    messaging_product: "whatsapp",
    to: WHATSAPP_TO,
    type: "text",
    text: {
      preview_url: false,
      body: mensagem.textoLivre || String(mensagem),
    },
  };
}

function montarPayloadTemplate(mensagem) {
  return {
    messaging_product: "whatsapp",
    to: WHATSAPP_TO,
    type: "template",
    template: {
      name: WHATSAPP_TEMPLATE_NAME,
      language: {
        code: WHATSAPP_TEMPLATE_LANGUAGE,
      },
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "text",
              text: limparParametroTemplate(mensagem.quantidade, 20),
            },
            {
              type: "text",
              text: limparParametroTemplate(
                mensagem.resumo,
                WHATSAPP_TEMPLATE_RESUMO_LIMIT
              ),
            },
          ],
        },
      ],
    },
  };
}

async function salvarMensagemWhatsAppEmArquivo(mensagem, payload, status, detalhe = null) {
  if (!WHATSAPP_SAVE_MESSAGES) {
    return;
  }

  const registro = [
    "============================================================",
    `Data/hora: ${new Date().toISOString()}`,
    `Status: ${status}`,
    `Para: ${WHATSAPP_TO || "não configurado"}`,
    `Tipo: ${WHATSAPP_USE_TEMPLATE ? "TEMPLATE" : "TEXTO LIVRE"}`,
    `Template: ${WHATSAPP_USE_TEMPLATE ? WHATSAPP_TEMPLATE_NAME : "não usado"}`,
    `Idioma: ${WHATSAPP_USE_TEMPLATE ? WHATSAPP_TEMPLATE_LANGUAGE : "não usado"}`,
    `Parte: ${mensagem?.parte_atual || "-"} / ${mensagem?.total_partes || "-"}`,
    `Quantidade total de e-mails muito importantes: ${mensagem?.quantidade || "-"}`,
    "",
    "TEXTO LIVRE:",
    mensagem?.textoLivre || "",
    "",
    "RESUMO TEMPLATE / PARÂMETRO {{2}}:",
    mensagem?.resumo || "",
    "",
    "PAYLOAD ENVIADO PARA A API, SEM TOKEN:",
    JSON.stringify(payload, null, 2),
    "",
    detalhe ? `DETALHE:\n${typeof detalhe === "string" ? detalhe : JSON.stringify(detalhe, null, 2)}` : "",
    "",
  ].join("\n");

  await fs.mkdir(dirname(WHATSAPP_MESSAGE_LOG_FILE), {
    recursive: true,
  });

  await fs.appendFile(WHATSAPP_MESSAGE_LOG_FILE, registro, "utf8");

  console.log(`Mensagem do WhatsApp salva em: ${WHATSAPP_MESSAGE_LOG_FILE}`);
}

async function enviarUmaMensagemWhatsApp(mensagem) {
  if (!WHATSAPP_ENABLED) {
    console.log("WhatsApp desativado no .env. Mensagem não enviada.");
    return null;
  }

  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN || !WHATSAPP_TO) {
    console.log(
      "WhatsApp não configurado. Verifique WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN e WHATSAPP_TO."
    );
    return null;
  }

  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const payload = WHATSAPP_USE_TEMPLATE
    ? montarPayloadTemplate(mensagem)
    : montarPayloadTexto(mensagem);

  console.log(
    `Enviando WhatsApp usando ${
      WHATSAPP_USE_TEMPLATE ? "TEMPLATE" : "TEXTO LIVRE"
    }...`
  );

  if (WHATSAPP_USE_TEMPLATE) {
    console.log(`Template: ${WHATSAPP_TEMPLATE_NAME}`);
    console.log(`Idioma: ${WHATSAPP_TEMPLATE_LANGUAGE}`);
    console.log("Parâmetro {{1}}:", (payload as any).template.components[0].parameters[0].text);
    console.log("Parâmetro {{2}}:", (payload as any).template.components[0].parameters[1].text);
  }

  await salvarMensagemWhatsAppEmArquivo(mensagem, payload, "PRE_ENVIO");

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    console.log("Mensagem enviada no WhatsApp.");
    console.log(
      `WhatsApp message id: ${
        response.data?.messages?.[0]?.id || "não informado"
      }`
    );

    await salvarMensagemWhatsAppEmArquivo(
      mensagem,
      payload,
      "ENVIADO_COM_SUCESSO",
      {
        whatsapp_message_id: response.data?.messages?.[0]?.id || null,
      }
    );

    return response.data;
  } catch (error) {
    console.error("Erro ao enviar WhatsApp.");

    if (error.response?.data) {
      console.error(JSON.stringify(error.response.data, null, 2));

      await salvarMensagemWhatsAppEmArquivo(
        mensagem,
        payload,
        "ERRO_AO_ENVIAR",
        error.response.data
      );
    } else {
      console.error(error.message);

      await salvarMensagemWhatsAppEmArquivo(
        mensagem,
        payload,
        "ERRO_AO_ENVIAR",
        error.message
      );
    }

    return null;
  }
}

export async function enviarWhatsApp(mensagemOuMensagens) {
  const mensagens = Array.isArray(mensagemOuMensagens)
    ? mensagemOuMensagens
    : [mensagemOuMensagens];

  const resultados = [];

  for (const mensagem of mensagens) {
    const resultado = await enviarUmaMensagemWhatsApp(mensagem);
    resultados.push(resultado);
  }

  return resultados;
}

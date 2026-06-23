import { promises as fs } from "fs";
import { dirname, resolve, isAbsolute } from "path";
import { fileURLToPath } from "url";
import { WHATSAPP_HISTORY_DAYS, WHATSAPP_QUEUE_FILE as WHATSAPP_QUEUE_FILE_RAW } from "../config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function resolverCaminhoFilaWhatsApp() {
  const caminhoEnv = WHATSAPP_QUEUE_FILE_RAW || "./whatsapp_queue.json";

  if (isAbsolute(caminhoEnv)) {
    return caminhoEnv;
  }

  // Volta duas pastas pois estamos em src/utils
  return resolve(__dirname, "../../", caminhoEnv);
}

const WHATSAPP_QUEUE_FILE = resolverCaminhoFilaWhatsApp();

export function limparHistoricoEnvios(fila: any) {
  if (!WHATSAPP_HISTORY_DAYS || WHATSAPP_HISTORY_DAYS <= 0) {
    return;
  }

  const limite = Date.now() - WHATSAPP_HISTORY_DAYS * 24 * 60 * 60 * 1000;

  for (const [chave, dataEnvio] of Object.entries(fila.envios || {})) {
    const data = new Date(dataEnvio as string | number | Date);

    if (Number.isNaN(data.getTime()) || data.getTime() < limite) {
      delete fila.envios[chave];
    }
  }
}

export async function lerFilaWhatsApp() {
  try {
    const conteudo = await fs.readFile(WHATSAPP_QUEUE_FILE, "utf8");
    const fila = JSON.parse(conteudo);

    const filaNormalizada = {
      pendentes: Array.isArray(fila.pendentes) ? fila.pendentes : [],
      envios: fila.envios && typeof fila.envios === "object" ? fila.envios : {},
    };

    limparHistoricoEnvios(filaNormalizada);

    return filaNormalizada;
  } catch (error) {
    if ((error as any).code !== "ENOENT") {
      console.log(
        `Não foi possível ler fila do WhatsApp. Uma nova fila será criada. Erro: ${(error as any).message}`
      );
    }

    return {
      pendentes: [],
      envios: {},
    };
  }
}

export async function salvarFilaWhatsApp(fila: any) {
  limparHistoricoEnvios(fila);

  await fs.mkdir(dirname(WHATSAPP_QUEUE_FILE), {
    recursive: true,
  });

  await fs.writeFile(
    WHATSAPP_QUEUE_FILE,
    JSON.stringify(fila, null, 2),
    "utf8"
  );
}

export function montarItemFilaWhatsApp(uid: any, email: any, resultado: any) {
  return {
    id: String(uid),
    uid: String(uid),
    remetente: email.remetente || "(remetente não identificado)",
    assunto: email.assunto,
    motivo: resultado.motivo,
    data_recebimento: email.data_recebimento,
    classificado_em: new Date().toISOString(),
  };
}

export function adicionarItensNaFilaWhatsApp(fila: any, itens: any[]) {
  const idsExistentes = new Set(fila.pendentes.map((item: any) => item.id));
  let adicionados = 0;

  for (const item of itens) {
    if (idsExistentes.has(item.id)) {
      continue;
    }

    fila.pendentes.push(item);
    idsExistentes.add(item.id);
    adicionados += 1;
  }

  return adicionados;
}

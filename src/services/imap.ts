import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import {
  IMAP_HOST,
  IMAP_PORT,
  IMAP_SECURE,
  IMAP_USER,
  IMAP_PASS,
  ONLY_UNSEEN,
  EMAIL_LOOKBACK_DAYS,
  FOLDER_MUITO_IMPORTANTE,
  FOLDER_IMPORTANTE,
  FOLDER_POUCO_IMPORTANTE,
  FOLDER_SPAM,
  SPAM_CREATE_FOLDER_IF_MISSING,
} from "../config/env.js";
import { itemEhPastaSpam } from "../utils/emailParser.js";

let pastasVerificadas = false;
export let pastaSpamResolvida: string | null = null;

export function criarCliente() {
  return new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: IMAP_SECURE,
    auth: {
      user: IMAP_USER,
      pass: IMAP_PASS,
    },
    logger: false,
  });
}

export async function resolverPastaSpam(client: any) {
  if (pastaSpamResolvida) {
    return pastaSpamResolvida;
  }

  const lista = await client.list();
  const encontrada = lista.find(itemEhPastaSpam);

  if (encontrada?.path) {
    pastaSpamResolvida = encontrada.path;
    return pastaSpamResolvida;
  }

  return null;
}

export async function pastaExiste(client: any, nomePasta: any) {
  const lista = await client.list();

  return lista.some((item: any) => {
    return item.path === nomePasta || item.name === nomePasta;
  });
}

export async function garantirPasta(client: any, nomePasta: any) {
  const existe = await pastaExiste(client, nomePasta);

  if (existe) {
    console.log(`Pasta já existe: ${nomePasta}`);
    return;
  }

  await client.mailboxCreate(nomePasta);
  console.log(`Pasta criada: ${nomePasta}`);
}

export async function garantirPastas(client: any) {
  if (pastasVerificadas) {
    return;
  }

  console.log("Verificando pastas de destino...");

  await garantirPasta(client, FOLDER_MUITO_IMPORTANTE);
  await garantirPasta(client, FOLDER_IMPORTANTE);
  await garantirPasta(client, FOLDER_POUCO_IMPORTANTE);

  const pastaSpam = await resolverPastaSpam(client);

  if (pastaSpam) {
    console.log(`Pasta de spam detectada: ${pastaSpam}`);
  } else if (SPAM_CREATE_FOLDER_IF_MISSING) {
    await garantirPasta(client, FOLDER_SPAM);
    pastaSpamResolvida = FOLDER_SPAM;
    console.log(`Pasta de spam criada por configuração: ${FOLDER_SPAM}`);
  } else {
    console.log(
      "Pasta de spam não detectada. Configure FOLDER_SPAM no .env com o nome exato da pasta de spam do provedor."
    );
  }

  pastasVerificadas = true;
}

export async function buscarUids(client: any) {
  const filtro: any = {};

  if (ONLY_UNSEEN) {
    filtro.seen = false;
  }

  if (EMAIL_LOOKBACK_DAYS > 0) {
    filtro.since = new Date(
      Date.now() - 1000 * 60 * 60 * 24 * EMAIL_LOOKBACK_DAYS
    );
  }

  console.log("Filtro de busca aplicado:");
  console.log(`- Somente não lidos: ${ONLY_UNSEEN ? "SIM" : "NÃO"}`);
  console.log(
    `- Buscar e-mails dos últimos dias: ${
      EMAIL_LOOKBACK_DAYS > 0 ? `${EMAIL_LOOKBACK_DAYS} dia(s)` : "SEM LIMITE"
    }`
  );

  return await client.search(filtro, { uid: true });
}

export async function baixarMensagem(client: any, uid: any) {
  console.log(`Baixando conteúdo completo do UID ${uid}...`);

  const download = await client.download(uid, undefined, {
    uid: true,
  });

  if (!download || !download.content) {
    throw new Error(`Não foi possível baixar o conteúdo do UID ${uid}.`);
  }

  const parsed = await simpleParser(download.content);

  return parsed;
}

export async function moverEmailClassificado(client: any, uid: any, resultado: any) {
  if (resultado.prioridade === "SPAM") {
    let pastaSpam = await resolverPastaSpam(client);

    if (!pastaSpam && SPAM_CREATE_FOLDER_IF_MISSING) {
      await garantirPasta(client, FOLDER_SPAM);
      pastaSpam = FOLDER_SPAM;
      pastaSpamResolvida = FOLDER_SPAM;
    }

    if (!pastaSpam) {
      throw new Error(
        "E-mail classificado como SPAM, mas nenhuma pasta de spam foi encontrada. Configure FOLDER_SPAM no .env."
      );
    }

    console.log(`Movendo UID ${uid} para spam: ${pastaSpam}`);

    await client.messageMove(uid, pastaSpam, {
      uid: true,
    });

    console.log(`Movido com sucesso para spam: ${pastaSpam}`);
    return;
  }

  await garantirPasta(client, resultado.pasta_sugerida);

  console.log(`Movendo UID ${uid} para: ${resultado.pasta_sugerida}`);

  await client.messageMove(uid, resultado.pasta_sugerida, {
    uid: true,
  });

  console.log(`Movido com sucesso para: ${resultado.pasta_sugerida}`);
}

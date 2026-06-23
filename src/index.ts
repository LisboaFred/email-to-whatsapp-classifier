import {
  RUN_CONTINUOUS,
  CHECK_INTERVAL_SECONDS,
  MAX_EMAILS_PER_RUN,
  EMAIL_LOOKBACK_DAYS,
  GEMINI_DELAY_MS,
  MOVE_EMAILS,
  ONLY_UNSEEN,
  WHATSAPP_ENABLED,
  SPAM_CREATE_FOLDER_IF_MISSING,
  IMAP_INBOX,
  FOLDER_SPAM,
  FOLDER_MUITO_IMPORTANTE,
  FOLDER_IMPORTANTE,
  FOLDER_POUCO_IMPORTANTE,
  WHATSAPP_TIMEZONE,
  WHATSAPP_SEND_HOURS,
  WHATSAPP_HISTORY_DAYS,
  WHATSAPP_QUEUE_FILE,
  WHATSAPP_USE_TEMPLATE,
  validarEnv,
} from "./config/env.js";

import {
  criarCliente,
  garantirPastas,
  buscarUids,
  baixarMensagem,
  moverEmailClassificado,
} from "./services/imap.js";

import { classificarComGemini } from "./services/gemini.js";
import { enviarWhatsApp, montarResumoWhatsApp } from "./services/whatsapp.js";
import { montarEmailParaClassificacao } from "./utils/emailParser.js";
import {
  lerFilaWhatsApp,
  salvarFilaWhatsApp,
  montarItemFilaWhatsApp,
  adicionarItensNaFilaWhatsApp,
} from "./utils/queue.js";

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function criarEstatisticas() {
  return {
    processados: 0,
    muito_importante: 0,
    importante: 0,
    pouco_importante: 0,
    spam: 0,
    erros: 0,
  };
}

function atualizarEstatisticas(estatisticas, prioridade) {
  estatisticas.processados += 1;

  if (prioridade === "MUITO_IMPORTANTE") {
    estatisticas.muito_importante += 1;
    return;
  }

  if (prioridade === "IMPORTANTE") {
    estatisticas.importante += 1;
    return;
  }

  if (prioridade === "POUCO_IMPORTANTE") {
    estatisticas.pouco_importante += 1;
    return;
  }

  if (prioridade === "SPAM") {
    estatisticas.spam += 1;
  }
}

function obterDataHoraLocal() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: WHATSAPP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const mapa = Object.fromEntries(
    partes.map((parte) => [parte.type, parte.value])
  );

  let hora = Number(mapa.hour);

  if (hora === 24) {
    hora = 0;
  }

  const minuto = Number(mapa.minute);
  const data = `${mapa.year}-${mapa.month}-${mapa.day}`;

  return {
    data,
    hora,
    minuto,
    chaveEnvio: `${data}-${String(hora).padStart(2, "0")}`,
  };
}

function deveEnviarWhatsAppAgora(fila) {
  if (!WHATSAPP_ENABLED) {
    return {
      deveEnviar: false,
      motivo: "WhatsApp desativado no .env.",
    };
  }

  if (!WHATSAPP_SEND_HOURS.length) {
    return {
      deveEnviar: false,
      motivo: "Nenhum horário configurado em WHATSAPP_SEND_HOURS.",
    };
  }

  if (!fila.pendentes.length) {
    return {
      deveEnviar: false,
      motivo: "Não há e-mails muito importantes pendentes para WhatsApp.",
    };
  }

  const agora = obterDataHoraLocal();

  if (!WHATSAPP_SEND_HOURS.includes(agora.hora)) {
    return {
      deveEnviar: false,
      motivo: `Fora do horário de envio do WhatsApp. Hora atual em ${WHATSAPP_TIMEZONE}: ${String(
        agora.hora
      ).padStart(2, "0")}:${String(agora.minuto).padStart(
        2,
        "0"
      )}. Horários configurados: ${WHATSAPP_SEND_HOURS.join(", ")}.`,
    };
  }

  if (fila.envios[agora.chaveEnvio]) {
    return {
      deveEnviar: false,
      motivo: `WhatsApp já enviado nesta janela: ${agora.chaveEnvio}.`,
    };
  }

  return {
    deveEnviar: true,
    chaveEnvio: agora.chaveEnvio,
  };
}

async function tentarEnviarResumoWhatsAppAgendado(fila) {
  const decisao = deveEnviarWhatsAppAgora(fila);

  if (!decisao.deveEnviar) {
    console.log(`WhatsApp não enviado agora: ${decisao.motivo}`);
    return;
  }

  console.log(
    `Horário de envio do WhatsApp atingido. Pendentes na fila: ${fila.pendentes.length}.`
  );

  const mensagens = montarResumoWhatsApp(fila.pendentes);

  if (!mensagens.length) {
    console.log("Nenhuma mensagem WhatsApp foi montada.");
    return;
  }

  console.log(`Total de mensagem(ns) WhatsApp montada(s): ${mensagens.length}`);

  for (const mensagem of mensagens) {
    console.log("--------------------------------------");
    console.log(mensagem.textoLivre);
    console.log("--------------------------------------");
  }

  const resultados = await enviarWhatsApp(mensagens);
  const sucesso = resultados.length > 0 && resultados.every(Boolean);

  if (!sucesso) {
    console.log(
      "WhatsApp não foi enviado com sucesso em todas as mensagens. A fila será mantida para tentar novamente no próximo horário configurado."
    );
    await salvarFilaWhatsApp(fila);
    return;
  }

  fila.envios[decisao.chaveEnvio] = new Date().toISOString();
  fila.pendentes = [];
  await salvarFilaWhatsApp(fila);

  console.log(`Fila do WhatsApp enviada e limpa. Janela: ${decisao.chaveEnvio}.`);
}

async function processarCaixa() {
  let client;
  const filaWhatsApp = await lerFilaWhatsApp();

  try {
    validarEnv();

    client = criarCliente();

    console.log(`[${new Date().toLocaleTimeString()}] Conectando ao IMAP...`);
    await client.connect();
    console.log(`[${new Date().toLocaleTimeString()}] Conectado ao IMAP.`);

    await garantirPastas(client);

    const lock = await client.getMailboxLock(IMAP_INBOX);

    try {
      const uidsEncontrados = await buscarUids(client);
      const uids =
        MAX_EMAILS_PER_RUN > 0
          ? uidsEncontrados.slice(0, MAX_EMAILS_PER_RUN)
          : uidsEncontrados;

      console.log(
        `[${new Date().toLocaleTimeString()}] UIDs encontrados: ${
          uidsEncontrados.length ? uidsEncontrados.join(", ") : "nenhum"
        }`
      );

      if (uidsEncontrados.length > uids.length) {
        console.log(
          `Limite por rodada aplicado: ${uids.length} de ${uidsEncontrados.length} e-mail(s). Os demais ficam para a próxima execução.`
        );
      }

      if (!uids.length) {
        console.log(
          `[${new Date().toLocaleTimeString()}] Nenhum e-mail novo para processar.`
        );
      } else {
        console.log(
          `[${new Date().toLocaleTimeString()}] Processando ${uids.length} e-mail(s) nesta execução.`
        );
      }

      const itensMuitoImportantesParaFila = [];
      const estatisticas = criarEstatisticas();

      for (const uid of uids) {
        console.log("\\n--------------------------------------");
        console.log(`Iniciando análise do UID ${uid}...`);

        try {
          const parsed = await baixarMensagem(client, uid);
          const email = montarEmailParaClassificacao(parsed);

          console.log(`UID: ${uid}`);
          console.log(
            `De: ${email.remetente || "(remetente não identificado)"}`
          );
          console.log(`Assunto: ${email.assunto}`);
          console.log(`Assunto vazio: ${email.assunto_vazio ? "SIM" : "NÃO"}`);
          console.log(`Data recebimento: ${email.data_recebimento}`);
          console.log(`Possui anexos: ${email.possui_anexos ? "SIM" : "NÃO"}`);
          console.log(
            `Tamanho do corpo extraído: ${email.corpo.length} caracteres`
          );

          if (!email.corpo && email.assunto_vazio) {
            console.log(
              "E-mail sem assunto e sem corpo extraído. Ele ficará na INBOX para análise manual."
            );
            continue;
          }

          console.log("Enviando e-mail para classificação no Gemini...");

          const { modelo, resultado } = await classificarComGemini(email);

          atualizarEstatisticas(estatisticas, resultado.prioridade);

          console.log("Resposta recebida do Gemini.");
          console.log(`Modelo: ${modelo}`);
          console.log(`Prioridade: ${resultado.prioridade}`);
          console.log(
            `Precisa ação direta: ${
              resultado.precisa_acao_direta ? "SIM" : "NÃO"
            }`
          );
          console.log(`Risco se não agir: ${resultado.risco_se_nao_agir}`);
          console.log(`Pasta sugerida: ${resultado.pasta_sugerida}`);
          console.log(`Motivo: ${resultado.motivo}`);

          if (MOVE_EMAILS) {
            await moverEmailClassificado(client, uid, resultado);
          } else {
            console.log("MOVE_EMAILS=false. E-mail não foi movido.");
            console.log(
              "Atenção: enquanto MOVE_EMAILS=false, o mesmo e-mail não lido pode aparecer novamente."
            );
          }

          if (resultado.prioridade === "MUITO_IMPORTANTE") {
            itensMuitoImportantesParaFila.push(
              montarItemFilaWhatsApp(uid, email, resultado)
            );
          }
        } catch (error) {
          estatisticas.erros += 1;

          console.error(`Erro ao processar UID ${uid}:`, error.message);
          console.error(
            "O e-mail não será movido. Ele ficará na caixa de entrada para análise manual."
          );
        } finally {
          if (GEMINI_DELAY_MS > 0) {
            console.log(
              `Aguardando ${Math.ceil(
                GEMINI_DELAY_MS / 1000
              )}s antes do próximo e-mail...`
            );

            await aguardar(GEMINI_DELAY_MS);
          }
        }
      }

      if (itensMuitoImportantesParaFila.length > 0) {
        const adicionados = adicionarItensNaFilaWhatsApp(
          filaWhatsApp,
          itensMuitoImportantesParaFila
        );

        await salvarFilaWhatsApp(filaWhatsApp);

        console.log(
          `E-mails muito importantes adicionados à fila do WhatsApp: ${adicionados}. Pendentes na fila: ${filaWhatsApp.pendentes.length}.`
        );
      } else {
        await salvarFilaWhatsApp(filaWhatsApp);
      }

      console.log("\\nResumo da execução:");
      console.log(`- Processados com classificação: ${estatisticas.processados}`);
      console.log(`- Muito importantes: ${estatisticas.muito_importante}`);
      console.log(`- Importantes: ${estatisticas.importante}`);
      console.log(`- Pouco importantes: ${estatisticas.pouco_importante}`);
      console.log(`- Spam: ${estatisticas.spam}`);
      console.log(`- Erros: ${estatisticas.erros}`);
      console.log(`- Pendentes na fila WhatsApp: ${filaWhatsApp.pendentes.length}`);
    } finally {
      lock.release();
    }
  } finally {
    if (client) {
      await client.logout().catch(() => {});
    }
  }

  await tentarEnviarResumoWhatsAppAgendado(filaWhatsApp);
}

async function main() {
  console.log("POC de classificação de e-mails iniciada.");
  console.log(
    `Modo: ${
      RUN_CONTINUOUS
        ? "contínuo. O processo ficará rodando."
        : "execução única. O processo será encerrado ao final."
    }`
  );
  console.log(`Intervalo entre execuções: ${CHECK_INTERVAL_SECONDS} segundos`);
  console.log(`Mover e-mails: ${MOVE_EMAILS ? "SIM" : "NÃO"}`);
  console.log(`Buscar somente não lidos: ${ONLY_UNSEEN ? "SIM" : "NÃO"}`);
  console.log(
    `Buscar e-mails dos últimos dias: ${
      EMAIL_LOOKBACK_DAYS > 0 ? EMAIL_LOOKBACK_DAYS : "SEM LIMITE"
    }`
  );
  console.log(`Máximo de e-mails por execução: ${MAX_EMAILS_PER_RUN}`);
  console.log(`Delay entre chamadas Gemini: ${GEMINI_DELAY_MS}ms`);
  console.log("Pastas usadas:");
  console.log(`- ${FOLDER_SPAM} [spam/env]`);
  console.log(`- ${FOLDER_MUITO_IMPORTANTE}`);
  console.log(`- ${FOLDER_IMPORTANTE}`);
  console.log(`- ${FOLDER_POUCO_IMPORTANTE}`);
  console.log(`WhatsApp: ${WHATSAPP_ENABLED ? "ATIVADO" : "DESATIVADO"}`);
  console.log(
    `WhatsApp template: ${
      WHATSAPP_USE_TEMPLATE ? "SIM" : "NÃO"
    }`
  );
  console.log(`WhatsApp horários: ${WHATSAPP_SEND_HOURS.join(", ")}`);
  console.log(`WhatsApp timezone: ${WHATSAPP_TIMEZONE}`);
  console.log(`WhatsApp fila: ${WHATSAPP_QUEUE_FILE}`);
  console.log(`WhatsApp histórico mantido por: ${WHATSAPP_HISTORY_DAYS} dia(s)`);

  do {
    console.log("\\n======================================");
    console.log(`Iniciando execução: ${new Date().toISOString()}`);
    console.log("======================================");

    await processarCaixa();

    console.log("Execução finalizada.");

    if (!RUN_CONTINUOUS) {
      break;
    }

    console.log(
      `Aguardando ${CHECK_INTERVAL_SECONDS} segundos para a próxima execução...`
    );

    await aguardar(CHECK_INTERVAL_SECONDS * 1000);
  } while (RUN_CONTINUOUS);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

import { FOLDER_SPAM } from "../config/env.js";

const NOMES_COMUNS_SPAM = [
  FOLDER_SPAM,
  "Junk Email",
  "Junk",
  "Spam",
  "Lixo Eletrônico",
  "Lixo eletrônico",
  "Lixo Eletronico",
  "Lixo eletronico",
  "Indesejados",
  "[Gmail]/Spam",
].filter(Boolean);

export function removerHistoricoRespostas(texto: any) {
  const bruto = String(texto || "").replace(/\r\n/g, "\n");

  const marcadores = [
    /\n-{2,}\s*original message\s*-{2,}/i,
    /\n_{5,}/i,
    /\nDe:\s.+\nEnviado:/i,
    /\nDe:\s.+\nPara:/i,
    /\nFrom:\s.+\nSent:/i,
    /\nFrom:\s.+\nTo:/i,
    /\nEm\s.+escreveu:/i,
    /\nOn\s.+wrote:/i,
    /\nAssunto:\s*RE:/i,
    /\nSubject:\s*RE:/i,
  ];

  let menorIndice = -1;

  for (const marcador of marcadores) {
    const match = bruto.match(marcador);

    if (!match || match.index === undefined) {
      continue;
    }

    const indice = match.index;

    if (indice > 80 && (menorIndice === -1 || indice < menorIndice)) {
      menorIndice = indice;
    }
  }

  if (menorIndice > 80) {
    return bruto.slice(0, menorIndice);
  }

  return bruto;
}

export function limitarTexto(texto: any, limite = 2500) {
  const semHistorico = removerHistoricoRespostas(texto);

  const limpo = String(semHistorico || "")
    .replace(/\s+/g, " ")
    .trim();

  return limpo.length > limite ? limpo.slice(0, limite) + "..." : limpo;
}

export function limparHtml(html: any) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n\s+\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function extrairCorpo(parsed: any) {
  if (parsed.text && parsed.text.trim()) {
    return limitarTexto(parsed.text, 2500);
  }

  if (parsed.html && String(parsed.html).trim()) {
    return limitarTexto(limparHtml(parsed.html), 2500);
  }

  return "";
}

export function formatarDataEmail(data: any) {
  if (data instanceof Date && !Number.isNaN(data.getTime())) {
    return data.toISOString();
  }

  return new Date().toISOString();
}

export function montarEmailParaClassificacao(parsed: any) {
  const assuntoOriginal = parsed.subject || "";

  return {
    remetente: parsed.from?.text || "",
    assunto: assuntoOriginal || "(sem assunto)",
    assunto_vazio: !assuntoOriginal || assuntoOriginal.trim().length === 0,
    data_recebimento: formatarDataEmail(parsed.date),
    possui_anexos:
      Array.isArray(parsed.attachments) && parsed.attachments.length > 0,
    corpo: extrairCorpo(parsed),
  };
}

export function normalizarTextoComparacao(texto: any) {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function obterEspecialUso(item: any) {
  const especial = item?.specialUse || item?.specialuse || item?.flags || [];

  if (Array.isArray(especial)) {
    return especial.map((valor) => String(valor).toLowerCase());
  }

  return [String(especial).toLowerCase()];
}

export function itemEhPastaSpam(item: any) {
  const especiais = obterEspecialUso(item);

  if (especiais.some((valor) => valor.includes("\\junk"))) {
    return true;
  }

  const pathNormalizado = normalizarTextoComparacao(item?.path);
  const nameNormalizado = normalizarTextoComparacao(item?.name);

  return NOMES_COMUNS_SPAM.some((nome) => {
    const nomeNormalizado = normalizarTextoComparacao(nome);

    return (
      pathNormalizado === nomeNormalizado ||
      nameNormalizado === nomeNormalizado
    );
  });
}

import "dotenv/config";
import fs from "fs";
import path from "path";

const configPath = path.resolve(process.cwd(), "config.json");
let appConfig: Record<string, any> = {};

try {
  appConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
} catch (err) {
  console.warn("Aviso: arquivo config.json não encontrado ou inválido. Usando fallback default.");
}

function getConfig(key: string, defaultValue: any) {
  return appConfig[key] !== undefined ? appConfig[key] : defaultValue;
}

// --- IMAP ---
export const IMAP_HOST = process.env.IMAP_HOST;
export const IMAP_PORT = getConfig("IMAP_PORT", 993);
export const IMAP_SECURE = getConfig("IMAP_SECURE", true);
export const IMAP_USER = process.env.IMAP_USER;
export const IMAP_PASS = process.env.IMAP_PASS;
export const IMAP_INBOX = getConfig("IMAP_INBOX", "INBOX");

// --- Gemini ---
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const GEMINI_MODEL = getConfig("GEMINI_MODEL", "gemini-2.5-flash");
export const GEMINI_MAX_RETRIES = getConfig("GEMINI_MAX_RETRIES", 3);
export const GEMINI_RETRY_FALLBACK_MS = getConfig("GEMINI_RETRY_FALLBACK_MS", 90000);
export const GEMINI_DELAY_MS = getConfig("GEMINI_DELAY_MS", 0);

// --- Pastas de Destino ---
export const FOLDER_SPAM = getConfig("FOLDER_SPAM", "Spam");
export const FOLDER_MUITO_IMPORTANTE = getConfig("FOLDER_MUITO_IMPORTANTE", "1 - Muito importante");
export const FOLDER_IMPORTANTE = getConfig("FOLDER_IMPORTANTE", "2 - Importante");
export const FOLDER_POUCO_IMPORTANTE = getConfig("FOLDER_POUCO_IMPORTANTE", "3 - Pouco importante");
export const SPAM_CREATE_FOLDER_IF_MISSING = getConfig("SPAM_CREATE_FOLDER_IF_MISSING", false);

// --- Comportamento ---
export const MOVE_EMAILS = getConfig("MOVE_EMAILS", false);
export const ONLY_UNSEEN = getConfig("ONLY_UNSEEN", true);
export const MAX_EMAILS_PER_RUN = getConfig("MAX_EMAILS_PER_RUN", 20);
export const EMAIL_LOOKBACK_DAYS = getConfig("EMAIL_LOOKBACK_DAYS", 2);
export const RUN_CONTINUOUS = getConfig("RUN_CONTINUOUS", false);
export const CHECK_INTERVAL_SECONDS = getConfig("CHECK_INTERVAL_SECONDS", 3600);

// --- WhatsApp ---
export const WHATSAPP_ENABLED = getConfig("WHATSAPP_ENABLED", false);
export const WHATSAPP_USE_TEMPLATE = getConfig("WHATSAPP_USE_TEMPLATE", false);
export const WHATSAPP_SAVE_MESSAGES = getConfig("WHATSAPP_SAVE_MESSAGES", false);
export const WHATSAPP_API_VERSION = getConfig("WHATSAPP_API_VERSION", "v22.0");
export const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
export const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
export const WHATSAPP_TO = process.env.WHATSAPP_TO?.trim();
export const WHATSAPP_TEMPLATE_NAME = getConfig("WHATSAPP_TEMPLATE_NAME", "resumo_emails_importantes");
export const WHATSAPP_TEMPLATE_LANGUAGE = getConfig("WHATSAPP_TEMPLATE_LANGUAGE", "pt_BR");
export const WHATSAPP_MAX_EMAILS_PER_MESSAGE = getConfig("WHATSAPP_MAX_EMAILS_PER_MESSAGE", 2);
export const WHATSAPP_MAX_TOTAL_MESSAGES = getConfig("WHATSAPP_MAX_TOTAL_MESSAGES", 3);
export const WHATSAPP_TEMPLATE_RESUMO_LIMIT = getConfig("WHATSAPP_TEMPLATE_RESUMO_LIMIT", 750);
export const WHATSAPP_TEXT_LIMIT = getConfig("WHATSAPP_TEXT_LIMIT", 3000);
export const WHATSAPP_TIMEZONE = getConfig("WHATSAPP_TIMEZONE", "America/Sao_Paulo");
export const WHATSAPP_SEND_HOURS = String(getConfig("WHATSAPP_SEND_HOURS", "8,12,17"))
  .split(",")
  .map((hora) => Number(hora.trim()))
  .filter((hora) => Number.isInteger(hora) && hora >= 0 && hora <= 23);
export const WHATSAPP_HISTORY_DAYS = getConfig("WHATSAPP_HISTORY_DAYS", 7);
export const WHATSAPP_QUEUE_FILE = getConfig("WHATSAPP_QUEUE_FILE", "./whatsapp_queue.json");
export const WHATSAPP_MESSAGE_LOG_FILE = getConfig("WHATSAPP_MESSAGE_LOG_FILE", "./whatsapp_messages_log.txt");

export function validarEnv() {
  const obrigatorias = ["IMAP_HOST", "IMAP_USER", "IMAP_PASS", "GEMINI_API_KEY"];
  const faltando = obrigatorias.filter((key) => !process.env[key]);

  if (faltando.length) {
    throw new Error(`Variáveis ausentes no .env: ${faltando.join(", ")}`);
  }
}

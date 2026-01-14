import { writeFileSync, appendFileSync, mkdirSync } from "fs";
import { join } from "path";

const LOG_DIR = join(process.cwd(), "logs");
const LOG_FILE = join(LOG_DIR, "server.log");

// Ensure logs directory exists
mkdirSync(LOG_DIR, { recursive: true });

// Clear log file on startup
writeFileSync(LOG_FILE, "");

function formatTimestamp(): string {
  return new Date().toISOString();
}

function writeLog(level: string, message: string, meta?: any): void {
  const timestamp = formatTimestamp();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  const logLine = `[${timestamp}] [${level}] ${message}${metaStr}\n`;

  appendFileSync(LOG_FILE, logLine);

  // Also log to console for development
  if (level === "ERROR") {
    console.error(logLine.trim());
  } else {
    console.log(logLine.trim());
  }
}

export const logger = {
  info: (message: string, meta?: any) => writeLog("INFO", message, meta),
  error: (message: string, meta?: any) => writeLog("ERROR", message, meta),
  warn: (message: string, meta?: any) => writeLog("WARN", message, meta),
  debug: (message: string, meta?: any) => writeLog("DEBUG", message, meta),
};

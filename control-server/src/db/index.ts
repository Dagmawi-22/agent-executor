import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { logger } from "../utils/logger.js";

const DB_PATH =
  process.env.DB_PATH || join(__dirname, "../../data/commands.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");

export function initializeDatabase(): void {
  const schemaSQL = readFileSync(join(__dirname, "schema.sql"), "utf-8");
  db.exec(schemaSQL);
  logger.info("Database initialized successfully");
}

export function runRecovery(recoverFn: () => number): void {
  const recoveredCount = recoverFn();
  if (recoveredCount > 0) {
    logger.warn(
      `Recovery: marked ${recoveredCount} RUNNING command(s) as FAILED (will be retried automatically)`
    );
  }
}

export function closeDatabase(): void {
  db.close();
  logger.info("Database connection closed");
}

process.on("SIGINT", () => {
  closeDatabase();
  process.exit(0);
});

process.on("SIGTERM", () => {
  closeDatabase();
  process.exit(0);
});

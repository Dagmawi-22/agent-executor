import Database from "better-sqlite3";
import { join } from "path";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { logger } from "../utils/logger";

const DB_PATH = process.env.IDEMPOTENCY_DB_PATH || join(process.cwd(), "data/idempotency.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

export function initializeIdempotency(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS executed_commands (
      commandId TEXT PRIMARY KEY,
      executedAt INTEGER NOT NULL
    )
  `);
  logger.info("Idempotency tracking initialized");
}

export function isCommandExecuted(commandId: string): boolean {
  const stmt = db.prepare("SELECT commandId FROM executed_commands WHERE commandId = ?");
  const row = stmt.get(commandId);
  return !!row;
}

export function markCommandExecuted(commandId: string): void {
  const stmt = db.prepare("INSERT OR IGNORE INTO executed_commands (commandId, executedAt) VALUES (?, ?)");
  stmt.run(commandId, Date.now());
}

export function closeIdempotencyDb(): void {
  db.close();
}

process.on("SIGINT", () => {
  closeIdempotencyDb();
  process.exit(0);
});

process.on("SIGTERM", () => {
  closeIdempotencyDb();
  process.exit(0);
});

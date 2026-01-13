import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";
import { mkdirSync } from "fs";
import { dirname } from "path";

const DB_PATH =
  process.env.DB_PATH || join(__dirname, "../../data/commands.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH, {
  verbose: process.env.NODE_ENV === "development" ? console.log : undefined,
});

db.pragma("journal_mode = WAL");

export function initializeDatabase(): void {
  const schemaSQL = readFileSync(join(__dirname, "schema.sql"), "utf-8");
  db.exec(schemaSQL);
  console.log("Database initialized successfully");
}

export function closeDatabase(): void {
  db.close();
  console.log("Database connection closed");
}

process.on("SIGINT", () => {
  closeDatabase();
  process.exit(0);
});

process.on("SIGTERM", () => {
  closeDatabase();
  process.exit(0);
});

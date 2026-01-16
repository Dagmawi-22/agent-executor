import { db } from "../db";
import type {
  Command,
  CommandPayload,
  CommandResult,
  CommandStatus,
  CommandType,
} from "../types";

interface CommandRow {
  id: string;
  type: string;
  payload: string;
  status: string;
  result: string | null;
  agentId: string | null;
  createdAt: number;
  updatedAt: number;
  assignedAt: number | null;
}

export class CommandsRepository {
  create(id: string, type: CommandType, payload: CommandPayload, now: number): void {
    const stmt = db.prepare(`
      INSERT INTO commands (id, type, payload, status, createdAt, updatedAt)
      VALUES (?, ?, ?, 'PENDING', ?, ?)
    `);

    stmt.run(id, type, JSON.stringify(payload), now, now);
  }

  findById(id: string): CommandRow | null {
    const stmt = db.prepare(`
      SELECT * FROM commands WHERE id = ?
    `);

    const row = stmt.get(id) as CommandRow | undefined;
    return row || null;
  }

  findAll(): CommandRow[] {
    const stmt = db.prepare(`
      SELECT * FROM commands WHERE 1
    `);

    return stmt.all() as CommandRow[];
  }

  findRunning(): CommandRow[] {
    const stmt = db.prepare(`
      SELECT * FROM commands WHERE status = 'RUNNING'
    `);

    return stmt.all() as CommandRow[];
  }

  findNextPending(): CommandRow | null {
    const stmt = db.prepare(`
      SELECT * FROM commands
      WHERE status IN ('PENDING', 'FAILED')
      ORDER BY createdAt ASC
      LIMIT 1
    `);

    const row = stmt.get() as CommandRow | undefined;
    return row || null;
  }

  updateStatus(id: string, status: CommandStatus, agentId: string | null, now: number): void {
    const stmt = db.prepare(`
      UPDATE commands
      SET status = ?, updatedAt = ?, agentId = COALESCE(?, agentId)
      WHERE id = ?
    `);

    stmt.run(status, now, agentId, id);
  }

  assignToAgent(id: string, agentId: string, now: number): void {
    const stmt = db.prepare(`
      UPDATE commands
      SET status = 'RUNNING', agentId = ?, updatedAt = ?, assignedAt = ?
      WHERE id = ?
    `);

    stmt.run(agentId, now, now, id);
  }

  updateResult(id: string, result: CommandResult, now: number): void {
    const stmt = db.prepare(`
      UPDATE commands
      SET result = ?, status = 'COMPLETED', updatedAt = ?
      WHERE id = ?
    `);

    stmt.run(JSON.stringify(result), now, id);
  }

  markFailed(id: string, now: number): void {
    const stmt = db.prepare(`
      UPDATE commands
      SET status = 'FAILED', updatedAt = ?
      WHERE id = ?
    `);

    stmt.run(now, id);
  }

  resetRunningToFailed(now: number): number {
    const stmt = db.prepare(`
      UPDATE commands
      SET status = 'FAILED', updatedAt = ?, agentId = NULL, assignedAt = NULL
      WHERE status = 'RUNNING'
    `);

    const info = stmt.run(now);
    return info.changes;
  }

  mapRowToCommand(row: CommandRow): Command {
    return {
      id: row.id,
      type: row.type as CommandType,
      payload: JSON.parse(row.payload) as CommandPayload,
      status: row.status as CommandStatus,
      result: row.result ? (JSON.parse(row.result) as CommandResult) : null,
      agentId: row.agentId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      assignedAt: row.assignedAt,
    };
  }
}

export const commandsRepository = new CommandsRepository();

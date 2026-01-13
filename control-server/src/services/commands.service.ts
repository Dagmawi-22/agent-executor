import { randomUUID } from "crypto";
import { db } from "../db";
import type {
  Command,
  CommandPayload,
  CommandResult,
  CommandStatus,
  CommandType,
} from "../types";

export class CommandsService {
  createCommand(type: CommandType, payload: CommandPayload): string {
    const id = randomUUID();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO commands (id, type, payload, status, createdAt, updatedAt)
      VALUES (?, ?, ?, 'PENDING', ?, ?)
    `);

    stmt.run(id, type, JSON.stringify(payload), now, now);

    return id;
  }

  getCommandById(id: string): Command | null {
    const stmt = db.prepare(`
      SELECT * FROM commands WHERE id = ?
    `);

    const row = stmt.get(id) as any;

    if (!row) {
      return null;
    }

    return this.mapRowToCommand(row);
  }

  updateCommandStatus(
    id: string,
    status: CommandStatus,
    agentId?: string
  ): void {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE commands
      SET status = ?, updatedAt = ?, agentId = COALESCE(?, agentId)
      WHERE id = ?
    `);

    stmt.run(status, now, agentId || null, id);
  }

  updateCommandResult(id: string, result: CommandResult): void {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE commands
      SET result = ?, status = 'COMPLETED', updatedAt = ?
      WHERE id = ?
    `);

    stmt.run(JSON.stringify(result), now, id);
  }

  markCommandFailed(id: string): void {
    const now = Date.now();
    const stmt = db.prepare(`
      UPDATE commands
      SET status = 'FAILED', updatedAt = ?
      WHERE id = ?
    `);

    stmt.run(now, id);
  }

  getNextPendingCommand(agentId: string): Command | null {
    const transaction = db.transaction(() => {
      const stmt = db.prepare(`
        SELECT * FROM commands
        WHERE status = 'PENDING'
        ORDER BY createdAt ASC
        LIMIT 1
      `);

      const row = stmt.get() as any;

      if (!row) {
        return null;
      }

      const now = Date.now();
      const updateStmt = db.prepare(`
        UPDATE commands
        SET status = 'RUNNING', agentId = ?, updatedAt = ?, assignedAt = ?
        WHERE id = ?
      `);

      updateStmt.run(agentId, now, now, row.id);

      return this.mapRowToCommand({
        ...row,
        status: "RUNNING",
        agentId,
        updatedAt: now,
        assignedAt: now,
      });
    });

    return transaction();
  }

  getAllRunningCommands(): Command[] {
    const stmt = db.prepare(`
      SELECT * FROM commands WHERE status = 'RUNNING'
    `);

    const rows = stmt.all() as any[];
    return rows.map((row) => this.mapRowToCommand(row));
  }

  private mapRowToCommand(row: any): Command {
    return {
      id: row.id,
      type: row.type as CommandType,
      payload: JSON.parse(row.payload),
      status: row.status as CommandStatus,
      result: row.result ? JSON.parse(row.result) : null,
      agentId: row.agentId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      assignedAt: row.assignedAt,
    };
  }
}

export const commandsService = new CommandsService();

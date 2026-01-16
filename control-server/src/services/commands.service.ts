import { randomUUID } from "crypto";
import { db } from "../db";
import { commandsRepository } from "../repositories/commands.repository";
import type {
  Command,
  CommandPayload,
  CommandResult,
  CommandType,
} from "../types";

export class CommandsService {
  createCommand(type: CommandType, payload: CommandPayload): string {
    const id = randomUUID();
    const now = Date.now();

    commandsRepository.create(id, type, payload, now);

    return id;
  }

  getCommandById(id: string): Command | null {
    const row = commandsRepository.findById(id);

    if (!row) {
      return null;
    }

    return commandsRepository.mapRowToCommand(row);
  }

  updateCommandResult(id: string, result: CommandResult): void {
    const now = Date.now();
    commandsRepository.updateResult(id, result, now);
  }

  getNextPendingCommand(agentId: string): Command | null {
    const transaction = db.transaction(() => {
      const row = commandsRepository.findNextPending();

      if (!row) {
        return null;
      }

      const now = Date.now();
      commandsRepository.assignToAgent(row.id, agentId, now);

      return commandsRepository.mapRowToCommand({
        ...row,
        status: "RUNNING",
        agentId,
        updatedAt: now,
        assignedAt: now,
      });
    });

    return transaction();
  }

  getAllCommands(): Command[] {
    const rows = commandsRepository.findAll();
    return rows.map((row) => commandsRepository.mapRowToCommand(row));
  }

  recoverRunningCommands(): number {
    const now = Date.now();
    return commandsRepository.resetRunningToFailed(now);
  }
}

export const commandsService = new CommandsService();

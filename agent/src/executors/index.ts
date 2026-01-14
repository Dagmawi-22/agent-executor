import { Command, CommandResult } from "../types";
import { executeDelay } from "./delay";
import { executeHttpGetJson } from "./http-get-json";
import { isCommandExecuted, markCommandExecuted } from "../services/idempotency";

export async function executeCommand(
  command: Command
): Promise<CommandResult> {
  if (isCommandExecuted(command.id)) {
    console.log(`Command ${command.id} already executed (idempotency check)`);
    throw new Error("Command already executed");
  }

  let result: CommandResult;

  switch (command.type) {
    case "DELAY":
      result = await executeDelay(command);
      break;
    case "HTTP_GET_JSON":
      result = await executeHttpGetJson(command);
      break;
    default:
      throw new Error(`Unknown command type: ${(command as any).type}`);
  }

  markCommandExecuted(command.id);

  return result;
}

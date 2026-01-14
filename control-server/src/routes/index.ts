import { FastifyInstance } from "fastify";
import { commandsService } from "../services/commands.service";
import type {
  CreateCommandRequest,
  CreateCommandResponse,
  GetCommandResponse,
  Command,
  UpdateCommandResultRequest,
  DelayPayload,
  HttpGetJsonPayload,
} from "../types";

function isDelayPayload(payload: unknown): payload is DelayPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "ms" in payload &&
    typeof (payload as DelayPayload).ms === "number"
  );
}

function isHttpGetJsonPayload(payload: unknown): payload is HttpGetJsonPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "url" in payload &&
    typeof (payload as HttpGetJsonPayload).url === "string"
  );
}

export async function routes(fastify: FastifyInstance) {
  fastify.get("/health", async () => {
    return "Api is doing well!";
  });

  fastify.post<{ Body: CreateCommandRequest }>(
    "/commands",
    async (request, reply) => {
      const { type, payload } = request.body;

      if (!type || !payload) {
        return reply.badRequest("Missing type or payload");
      }

      if (type !== "DELAY" && type !== "HTTP_GET_JSON") {
        return reply.badRequest("Invalid command type");
      }

      if (type === "DELAY" && !isDelayPayload(payload)) {
        return reply.badRequest("DELAY payload must have ms as number");
      }

      if (type === "HTTP_GET_JSON" && !isHttpGetJsonPayload(payload)) {
        return reply.badRequest(
          "HTTP_GET_JSON payload must have url as string"
        );
      }

      const commandId = commandsService.createCommand(type, payload);

      const response: CreateCommandResponse = { commandId };
      return reply.code(201).send(response);
    }
  );

  fastify.get<{}>("/commands", async (request, reply) => {
    const commands = commandsService.getAllCommands();

    return commands;
  });

  fastify.get<{ Params: { id: string } }>(
    "/commands/:id",
    async (request, reply) => {
      const { id } = request.params;

      const command = commandsService.getCommandById(id);

      if (!command) {
        return reply.notFound("Command not found");
      }

      const response: GetCommandResponse = {
        status: command.status,
        result: command.result,
        agentId: command.agentId,
      };

      return response;
    }
  );

  fastify.get<{ Querystring: { agentId: string } }>(
    "/commands/next",
    async (request, reply) => {
      const { agentId } = request.query;

      if (!agentId) {
        return reply.badRequest("Missing agentId query parameter");
      }

      const command = commandsService.getNextPendingCommand(agentId);

      if (!command) {
        return reply.code(204).send();
      }

      const response: Command = command;
      return response;
    }
  );

  fastify.put<{
    Params: { id: string };
    Body: UpdateCommandResultRequest;
  }>("/commands/:id/result", async (request, reply) => {
    const { id } = request.params;
    const { result, agentId } = request.body;

    if (!result || !agentId) {
      return reply.badRequest("Missing result or agentId");
    }

    const command = commandsService.getCommandById(id);

    if (!command) {
      return reply.notFound("Command not found");
    }

    if (command.status !== "RUNNING") {
      return reply.badRequest("Command is not in RUNNING state");
    }

    if (command.agentId !== agentId) {
      return reply.badRequest("Command is not assigned to this agent");
    }

    commandsService.updateCommandResult(id, result);

    return reply.code(200).send({ success: true });
  });
}

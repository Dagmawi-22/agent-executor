import { FastifyInstance } from "fastify";
import { commandsService } from "../services/commands.service";
import type {
  CreateCommandRequest,
  CreateCommandResponse,
  GetCommandResponse,
} from "../types";

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

      if (type === "DELAY" && typeof (payload as any).ms !== "number") {
        return reply.badRequest("DELAY payload must have ms as number");
      }

      if (type === "HTTP_GET_JSON" && typeof (payload as any).url !== "string") {
        return reply.badRequest("HTTP_GET_JSON payload must have url as string");
      }

      const commandId = commandsService.createCommand(type, payload);

      const response: CreateCommandResponse = { commandId };
      return reply.code(201).send(response);
    }
  );

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
}

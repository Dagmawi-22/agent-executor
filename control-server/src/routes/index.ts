import { FastifyInstance } from "fastify";
import { commandsController } from "../controllers/commands.controller";
import type {
  CreateCommandRequest,
  UpdateCommandResultRequest,
} from "../types";

export async function routes(fastify: FastifyInstance) {
  fastify.get("/health", async () => {
    return { status: "ok" };
  });

  fastify.post<{ Body: CreateCommandRequest }>(
    "/commands",
    commandsController.createCommand.bind(commandsController)
  );

  fastify.get("/commands", commandsController.getAllCommands.bind(commandsController));

  fastify.get<{ Params: { id: string } }>(
    "/commands/:id",
    commandsController.getCommandById.bind(commandsController)
  );

  fastify.get<{ Querystring: { agentId: string } }>(
    "/commands/next",
    commandsController.getNextCommand.bind(commandsController)
  );

  fastify.put<{
    Params: { id: string };
    Body: UpdateCommandResultRequest;
  }>(
    "/commands/:id/result",
    commandsController.updateCommandResult.bind(commandsController)
  );
}

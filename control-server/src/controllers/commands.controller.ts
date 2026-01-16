import { FastifyReply, FastifyRequest } from "fastify";
import { commandsService } from "../services/commands.service";
import type {
  CreateCommandRequest,
  CreateCommandResponse,
  GetCommandResponse,
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

export class CommandsController {
  async createCommand(
    request: FastifyRequest<{ Body: CreateCommandRequest }>,
    reply: FastifyReply
  ) {
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
      return reply.badRequest("HTTP_GET_JSON payload must have url as string");
    }

    const commandId = commandsService.createCommand(type, payload);

    const response: CreateCommandResponse = { commandId };
    return reply.code(201).send(response);
  }

  async getAllCommands(request: FastifyRequest, reply: FastifyReply) {
    const commands = commandsService.getAllCommands();
    return commands;
  }

  async getCommandById(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
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

  async getNextCommand(
    request: FastifyRequest<{ Querystring: { agentId: string } }>,
    reply: FastifyReply
  ) {
    const { agentId } = request.query;

    if (!agentId) {
      return reply.badRequest("Missing agentId query parameter");
    }

    const command = commandsService.getNextPendingCommand(agentId);

    if (!command) {
      return reply.code(204).send();
    }

    return command;
  }

  async updateCommandResult(
    request: FastifyRequest<{
      Params: { id: string };
      Body: UpdateCommandResultRequest;
    }>,
    reply: FastifyReply
  ) {
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
  }
}

export const commandsController = new CommandsController();

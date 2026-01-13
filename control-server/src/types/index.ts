


export type CommandType = "DELAY" | "HTTP_GET_JSON";

export type CommandStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export interface DelayPayload {
  ms: number;
}

export interface HttpGetJsonPayload {
  url: string;
}

export type CommandPayload = DelayPayload | HttpGetJsonPayload;

export interface DelayResult {
  ok: true;
  tookMs: number;
}

export interface HttpGetJsonResult {
  status: number;
  body: object | string | null;
  truncated: boolean;
  bytesReturned: number;
  error: string | null;
}

export type CommandResult = DelayResult | HttpGetJsonResult;

export interface Command {
  id: string;
  type: CommandType;
  payload: CommandPayload;
  status: CommandStatus;
  result: CommandResult | null;
  agentId: string | null;
  createdAt: number;
  updatedAt: number;
  assignedAt: number | null;
}

export interface CreateCommandRequest {
  type: CommandType;
  payload: CommandPayload;
}

export interface CreateCommandResponse {
  commandId: string;
}

export interface GetCommandResponse {
  status: CommandStatus;
  result: CommandResult | null;
  agentId: string | null;
}

export interface UpdateCommandResultRequest {
  result: CommandResult;
  agentId: string;
}




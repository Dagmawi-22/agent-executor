import { Command, CommandResult } from "../types";
import { logger } from "../utils/logger.js";

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  queryParams?: Record<string, string>;
}

class ApiClient {
  private static instance: ApiClient | null = null;
  private serverUrl: string;

  private constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  public static initialize(serverUrl: string): void {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient(serverUrl);
      logger.info(`API client initialized with server: ${serverUrl}`);
    }
  }

  private static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      throw new Error("API client not initialized. Call initializeApi() first.");
    }
    return ApiClient.instance;
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T | null> {
    const { method = "GET", headers = {}, body, queryParams } = options;

    let url = `${this.serverUrl}${endpoint}`;
    if (queryParams) {
      const params = new URLSearchParams(queryParams);
      url = `${url}?${params}`;
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body,
      });

      if (response.status === 204) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Request failed: ${response.statusText}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      logger.error(`API request error: ${method} ${endpoint}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  public async pollForCommand(agentId: string): Promise<Command | null> {
    return this.request<Command>("/commands/next", {
      queryParams: { agentId },
    });
  }

  public async submitResult(
    commandId: string,
    result: CommandResult,
    agentId: string
  ): Promise<void> {
    await this.request(`/commands/${commandId}/result`, {
      method: "PUT",
      body: JSON.stringify({ result, agentId }),
    });
  }
}

export function initializeApi(serverUrl: string): void {
  ApiClient.initialize(serverUrl);
}

export async function pollForCommand(agentId: string): Promise<Command | null> {
  const client = ApiClient["getInstance"]();
  return client.pollForCommand(agentId);
}

export async function submitResult(
  commandId: string,
  result: CommandResult,
  agentId: string
): Promise<void> {
  const client = ApiClient["getInstance"]();
  return client.submitResult(commandId, result, agentId);
}

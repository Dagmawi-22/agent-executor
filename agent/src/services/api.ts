import { Command, CommandResult } from "../types";

export async function pollForCommand(
  serverUrl: string,
  agentId: string
): Promise<Command | null> {
  try {
    const response = await fetch(
      `${serverUrl}/commands/next?agentId=${agentId}`
    );

    if (response.status === 204) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to poll: ${response.statusText}`);
    }

    const command = await response.json() as Command;
    return command;
  } catch (error) {
    console.error("Error polling for command:", error);
    throw error;
  }
}

export async function submitResult(
  serverUrl: string,
  commandId: string,
  result: CommandResult,
  agentId: string
): Promise<void> {
  try {
    const response = await fetch(`${serverUrl}/commands/${commandId}/result`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ result, agentId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to submit result: ${response.statusText}`);
    }
  } catch (error) {
    console.error("Error submitting result:", error);
    throw error;
  }
}

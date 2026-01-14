import { Command, DelayResult, DelayPayload } from "../types";

export async function executeDelay(
  command: Command
): Promise<DelayResult> {
  const payload = command.payload as DelayPayload;
  const startTime = Date.now();

  await sleep(payload.ms);

  const tookMs = Date.now() - startTime;

  return {
    ok: true,
    tookMs,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

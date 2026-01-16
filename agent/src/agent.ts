import { randomUUID } from "crypto";
import { AgentConfig } from "./types";
import { initializeApi, pollForCommand, submitResult } from "./services/api";
import { executeCommand } from "./executors";
import { initializeIdempotency } from "./services/idempotency";
import { logger } from "./utils/logger.js";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "2000", 10);
const AGENT_ID = process.env.AGENT_ID || `agent-${randomUUID()}`;

let killAfter: number | undefined;
let randomFailures = false;
let startTime = Date.now();

function parseArgs() {
  const args = process.argv.slice(2);

  for (const arg of args) {
    if (arg.startsWith("--kill-after=")) {
      const value = arg.split("=")[1];
      killAfter = parseInt(value, 10) * 1000;
    }
    if (arg === "--random-failures") {
      randomFailures = true;
    }
  }
}

async function main() {
  parseArgs();

  const config: AgentConfig = {
    agentId: AGENT_ID,
    serverUrl: SERVER_URL,
    pollInterval: POLL_INTERVAL,
    killAfter,
    randomFailures,
  };

  initializeIdempotency();
  initializeApi(config.serverUrl);

  logger.info(`Agent started: ${config.agentId}`);
  logger.info(`Server: ${config.serverUrl}`);
  logger.info(`Poll interval: ${config.pollInterval}ms`);
  if (config.killAfter) {
    logger.warn(`Will crash after: ${config.killAfter / 1000}s`);
  }
  if (config.randomFailures) {
    logger.warn(`Random failures: enabled`);
  }

  while (true) {
    try {
      if (config.killAfter && Date.now() - startTime > config.killAfter) {
        logger.warn("Simulating crash (--kill-after)");
        process.exit(1);
      }

      if (config.randomFailures && Math.random() < 0.1) {
        logger.warn("Simulating crash (--random-failures)");
        process.exit(1);
      }

      const command = await pollForCommand(config.agentId);

      if (!command) {
        await sleep(config.pollInterval);
        continue;
      }

      logger.info(`Received command: ${command.id} (${command.type})`);

      const result = await executeCommand(command);

      logger.info(`Completed command: ${command.id}`);

      await submitResult(command.id, result, config.agentId);

      logger.info(`Submitted result for: ${command.id}`);
    } catch (error) {
      logger.error("Error in agent loop", { error: error instanceof Error ? error.message : String(error) });
      await sleep(config.pollInterval);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  logger.error("Fatal error", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});

import { randomUUID } from "crypto";
import { AgentConfig } from "./types";
import { pollForCommand, submitResult } from "./services/api";
import { executeCommand } from "./executors";
import { initializeIdempotency } from "./services/idempotency";

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

  console.log(`Agent started: ${config.agentId}`);
  console.log(`Server: ${config.serverUrl}`);
  console.log(`Poll interval: ${config.pollInterval}ms`);
  if (config.killAfter) {
    console.log(`Will crash after: ${config.killAfter / 1000}s`);
  }
  if (config.randomFailures) {
    console.log(`Random failures: enabled`);
  }

  while (true) {
    try {
      if (config.killAfter && Date.now() - startTime > config.killAfter) {
        console.log("Simulating crash (--kill-after)");
        process.exit(1);
      }

      if (config.randomFailures && Math.random() < 0.1) {
        console.log("Simulating crash (--random-failures)");
        process.exit(1);
      }

      const command = await pollForCommand(config.serverUrl, config.agentId);

      if (!command) {
        await sleep(config.pollInterval);
        continue;
      }

      console.log(`Received command: ${command.id} (${command.type})`);

      const result = await executeCommand(command);

      console.log(`Completed command: ${command.id}`);

      await submitResult(
        config.serverUrl,
        command.id,
        result,
        config.agentId
      );

      console.log(`Submitted result for: ${command.id}`);
    } catch (error) {
      console.error("Error in agent loop:", error);
      await sleep(config.pollInterval);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

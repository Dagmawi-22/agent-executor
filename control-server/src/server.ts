import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { routes } from "./routes";
import { initializeDatabase, runRecovery } from "./db";
import { commandsService } from "./services/commands.service";
import { logger } from "./utils/logger";

const fastify = Fastify({ logger: false });

fastify.register(cors);
fastify.register(sensible);

fastify.register(routes);

const start = async () => {
  try {
    initializeDatabase();
    runRecovery(() => commandsService.recoverRunningCommands());

    await fastify.listen({ port: 3000 });
    logger.info("Control server listening on port 3000");
  } catch (err) {
    logger.error("Failed to start server", { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
};

start();

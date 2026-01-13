import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { routes } from "./routes";
import { initializeDatabase } from "./db";

const fastify = Fastify({ logger: true });

fastify.register(cors);
fastify.register(sensible);

fastify.register(routes);

const start = async () => {
  try {
    initializeDatabase();

    await fastify.listen({ port: 3000 });
    console.log("Control server listening on port 3000");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

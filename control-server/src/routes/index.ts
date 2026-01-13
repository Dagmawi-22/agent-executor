import { FastifyInstance } from "fastify";

export async function routes(fastify: FastifyInstance) {
  fastify.get("/health", async (req, reply) => {
    const res = "Api is doing well!";
    return res;
  });
}

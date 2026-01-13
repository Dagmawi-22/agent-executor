import { FastifyInstance } from "fastify";

export async function routes(fastify: FastifyInstance) {
  fastify.get("/health", async (req, reply) => {
    try {
      const res = "Api is doing well!";
      return res;
    } catch (e) {
      console.log("Api isn't doing well", e);
    }
  });
}

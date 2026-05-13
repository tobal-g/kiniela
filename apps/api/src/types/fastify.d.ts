import type { PublicUser } from "@kiniela/shared";

declare module "fastify" {
  interface FastifyRequest {
    user: PublicUser | null;
  }
}

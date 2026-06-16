import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
    );
  }
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

/**
 * Lazy Prisma singleton. The client is only constructed on first use, so
 * importing `db` does not throw if DATABASE_URL is unset at module-load time
 * (e.g. during `next build` prerender of pages that don't actually use it).
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
    return Reflect.get(globalForPrisma.prisma, prop, globalForPrisma.prisma);
  },
});

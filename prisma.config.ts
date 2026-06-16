import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Load .env.local first (Next.js convention), then fall back to .env.
loadEnv({ path: ".env.local" });
loadEnv();

// `prisma generate` doesn't need a real URL — it only reads the schema. Only
// migrate/seed actually connect. We accept a placeholder when neither env var
// is set so `pnpm install` (which runs `prisma generate` postinstall) doesn't
// crash during CI / on a fresh checkout. Real operations will surface a clear
// connection error later.
const url =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  "postgresql://placeholder:placeholder@localhost:5432/placeholder?sslmode=disable";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: { url },
});

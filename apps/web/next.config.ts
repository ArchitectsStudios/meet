import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// In development, read the repo-root .env so web and bot share one file.
const rootEnv = path.resolve(process.cwd(), "../../.env");
if (process.env.NODE_ENV !== "production" && existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

const config: NextConfig = {
  output: "standalone",
  // Trace files from the monorepo root so the standalone build includes @meet/shared.
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  transpilePackages: ["@meet/shared"],
  serverExternalPackages: ["mongodb"],
  poweredByHeader: false,
};

export default config;

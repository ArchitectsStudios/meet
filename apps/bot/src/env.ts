import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

// In development, read the repo-root .env. In the cluster, values come from the Secret.
const rootEnv = resolve(process.cwd(), "../../.env");
if (process.env.NODE_ENV !== "production" && existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

const schema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_GUILD_ID: z.string().min(1),
  INTERNAL_API_SECRET: z.string().min(16, "INTERNAL_API_SECRET must be at least 16 characters"),
  MONGODB_URI: z.string().min(1),
  APP_URL: z.string().url(),
  BOT_PORT: z.coerce.number().int().default(3001),
  REMINDER_INTERVAL_MS: z.coerce.number().int().default(60_000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid bot environment:", z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;

import "server-only";
import { z } from "zod";

const schema = z.object({
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_GUILD_ID: z.string().min(1),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  INTERNAL_API_SECRET: z.string().min(16),
  MONGODB_URI: z.string().min(1),
  APP_URL: z.string().url(),
  BOT_API_URL: z.string().url(),
});

let cached: z.infer<typeof schema> | undefined;

/** Read lazily so `next build` works without secrets. */
export function env() {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) throw new Error(`Invalid web environment:\n${z.prettifyError(parsed.error)}`);
    cached = parsed.data;
  }
  return cached;
}

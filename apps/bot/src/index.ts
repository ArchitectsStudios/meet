import { Events } from "discord.js";
import { getMongoClient } from "@meet/shared/db";
import { env } from "./env";
import { client, warmMemberCache } from "./discord";
import { handleInteraction } from "./interactions";
import { startReminderLoop } from "./reminders";
import { buildApi } from "./api";

async function main() {
  await getMongoClient(env.MONGODB_URI);

  const api = buildApi();
  await api.listen({ host: "0.0.0.0", port: env.BOT_PORT });
  console.log(`Internal API listening on :${env.BOT_PORT}`);

  let stopReminders: (() => void) | undefined;

  client.once(Events.ClientReady, async (c) => {
    console.log(`Logged in as ${c.user.tag}`);
    try {
      await warmMemberCache();
    } catch (err) {
      console.error("Could not load guild members. Is the bot in the guild, with Server Members Intent on?", err);
    }
    stopReminders = startReminderLoop();
  });

  client.on(Events.InteractionCreate, (interaction) => {
    handleInteraction(interaction).catch((err) => console.error("interaction failed:", err));
  });

  await client.login(env.DISCORD_BOT_TOKEN);

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down`);
    stopReminders?.();
    await api.close();
    await client.destroy();
    await (await getMongoClient()).close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

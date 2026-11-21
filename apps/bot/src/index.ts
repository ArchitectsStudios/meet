import { Events } from "discord.js";
import { getMongoClient } from "@meet/shared/db";
import { env } from "./env";
import { client, warmAllGuilds, warmGuild } from "./discord";
import { handleInteraction } from "./interactions";
import { startReminderLoop } from "./reminders";
import { buildApi } from "./api";

async function main() {
  console.log(`meet bot ${process.env.MEET_BUILD_STRING || "untracked version"}${process.env.MEET_BUILD_COMMIT ? ` (${process.env.MEET_BUILD_COMMIT})` : ""}`);
  await getMongoClient(env.MONGODB_URI);

  const api = buildApi();
  await api.listen({ host: "0.0.0.0", port: env.BOT_PORT });
  console.log(`Internal API listening on :${env.BOT_PORT}`);

  let stopReminders: (() => void) | undefined;

  client.once(Events.ClientReady, async (c) => {
    console.log(`Logged in as ${c.user.tag}`);
    await warmAllGuilds();
    stopReminders = startReminderLoop();
  });

  // A server that adds the bot later needs its members cached before people from it can log in.
  client.on(Events.GuildCreate, (g) => {
    console.log(`Joined ${g.name}`);
    void warmGuild(g);
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

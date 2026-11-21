import "server-only";
import { cookies } from "next/headers";
import type { GuildSummary } from "@meet/shared";
import { bot } from "./bot";
import { HttpError } from "./session";

/** Cookie holding the server the user picked in the header. */
export const ACTIVE_GUILD_COOKIE = "meet_guild";

/** Servers the user shares with the bot. */
export function userGuilds(discordId: string): Promise<GuildSummary[]> {
  return bot.userGuilds(discordId);
}

/** The picked server if the user is still in it, otherwise their first server. */
export function pickActiveGuild(guilds: GuildSummary[], wanted: string | undefined): GuildSummary | null {
  return guilds.find((g) => g.id === wanted) ?? guilds[0] ?? null;
}

/** For pages: the user's servers and the active one. */
export async function activeGuild(discordId: string): Promise<{ guilds: GuildSummary[]; active: GuildSummary | null }> {
  const guilds = await userGuilds(discordId);
  const store = await cookies();
  return { guilds, active: pickActiveGuild(guilds, store.get(ACTIVE_GUILD_COOKIE)?.value) };
}

/**
 * For route handlers: the user must be in the server before they can see its members, roles or
 * channels, or create meetings in it. Otherwise anyone could list any server the bot is in.
 */
export async function requireGuildMember(discordId: string, guildId: string): Promise<void> {
  const member = await bot.getMember(guildId, discordId);
  if (!member) throw new HttpError(403, "You are not a member of that server");
}

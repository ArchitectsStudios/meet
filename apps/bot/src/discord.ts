import { ChannelType, Client, GatewayIntentBits, Partials, type Guild, type GuildMember } from "discord.js";
import type { GuildSummary, MemberSummary, RoleSummary, VoiceChannelSummary } from "@meet/shared";

export const client = new Client({
  // GuildMembers is a privileged intent: enable "Server Members Intent" in the Developer Portal.
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel],
});

/** Thrown for a server the bot is not in; the API turns it into a 404. */
export class UnknownGuildError extends Error {}

export function guild(guildId: string): Guild {
  const g = client.guilds.cache.get(guildId);
  if (!g) throw new UnknownGuildError(`Bot is not in guild ${guildId}`);
  return g;
}

/** Loads every member of one server into the cache so search and role lookups need no extra API calls. */
export async function warmGuild(g: Guild): Promise<void> {
  try {
    await g.members.fetch();
    console.log(`Cached ${g.members.cache.size} members of ${g.name}`);
  } catch (err) {
    console.error(`Could not load members of ${g.name}. Is Server Members Intent on?`, err);
  }
}

export async function warmAllGuilds(): Promise<void> {
  await Promise.all([...client.guilds.cache.values()].map(warmGuild));
}

export function guildSummary(g: Guild): GuildSummary {
  return { id: g.id, name: g.name, iconUrl: g.iconURL({ size: 64 }) };
}

/** Servers that have both the bot and the given user, sorted by name. */
export function guildsForUser(userId: string): GuildSummary[] {
  return [...client.guilds.cache.values()]
    .filter((g) => g.members.cache.has(userId))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(guildSummary);
}

export function memberSummary(m: GuildMember): MemberSummary {
  return {
    id: m.id,
    username: m.user.username,
    displayName: m.displayName,
    avatarUrl: m.displayAvatarURL({ size: 64 }),
  };
}

export function searchMembers(guildId: string, query: string, limit: number): MemberSummary[] {
  const q = query.trim().toLowerCase();
  const results: GuildMember[] = [];
  for (const m of guild(guildId).members.cache.values()) {
    if (m.user.bot) continue;
    const hay = [m.user.username, m.user.globalName ?? "", m.nickname ?? ""].map((s) => s.toLowerCase());
    if (!q || hay.some((h) => h.includes(q))) results.push(m);
  }
  // Prefix matches first, then alphabetical.
  results.sort((a, b) => {
    const ap = a.displayName.toLowerCase().startsWith(q) || a.user.username.startsWith(q) ? 0 : 1;
    const bp = b.displayName.toLowerCase().startsWith(q) || b.user.username.startsWith(q) ? 0 : 1;
    return ap - bp || a.displayName.localeCompare(b.displayName);
  });
  return results.slice(0, limit).map(memberSummary);
}

export async function getMember(guildId: string, id: string): Promise<GuildMember | null> {
  const g = guild(guildId);
  const cached = g.members.cache.get(id);
  if (cached) return cached;
  try {
    return await g.members.fetch(id);
  } catch {
    return null;
  }
}

export function listRoles(guildId: string): RoleSummary[] {
  const g = guild(guildId);
  return [...g.roles.cache.values()]
    .filter((r) => r.id !== g.id && !r.managed)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: r.hexColor,
      memberCount: r.members.filter((m) => !m.user.bot).size,
    }));
}

export function roleMembers(guildId: string, roleId: string): { role: RoleSummary; members: MemberSummary[] } | null {
  const g = guild(guildId);
  const r = g.roles.cache.get(roleId);
  if (!r || r.id === g.id) return null;
  const members = [...r.members.values()].filter((m) => !m.user.bot).map(memberSummary);
  return {
    role: { id: r.id, name: r.name, color: r.hexColor, memberCount: members.length },
    members,
  };
}

export function listVoiceChannels(guildId: string): VoiceChannelSummary[] {
  const g = guild(guildId);
  return [...g.channels.cache.values()]
    .filter((c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice)
    .sort((a, b) => ("position" in a && "position" in b ? a.position - b.position : 0))
    .map((c) => ({ id: c.id, name: c.name, parent: c.parent?.name ?? null }));
}

export function voiceChannelUrl(guildId: string, channelId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

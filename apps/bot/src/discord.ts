import { ChannelType, Client, GatewayIntentBits, Partials, type Guild, type GuildMember } from "discord.js";
import type { MemberSummary, RoleSummary, VoiceChannelSummary } from "@meet/shared";
import { env } from "./env";

export const client = new Client({
  // GuildMembers is a privileged intent: enable "Server Members Intent" in the Developer Portal.
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel],
});

export function guild(): Guild {
  const g = client.guilds.cache.get(env.DISCORD_GUILD_ID);
  if (!g) throw new Error(`Bot is not in guild ${env.DISCORD_GUILD_ID}`);
  return g;
}

/** Loads every member into the cache so search and role lookups work without extra API calls. */
export async function warmMemberCache(): Promise<void> {
  const g = await client.guilds.fetch(env.DISCORD_GUILD_ID);
  await g.members.fetch();
  console.log(`Cached ${g.members.cache.size} members of ${g.name}`);
}

export function memberSummary(m: GuildMember): MemberSummary {
  return {
    id: m.id,
    username: m.user.username,
    displayName: m.displayName,
    avatarUrl: m.displayAvatarURL({ size: 64 }),
  };
}

export function searchMembers(query: string, limit: number): MemberSummary[] {
  const q = query.trim().toLowerCase();
  const results: GuildMember[] = [];
  for (const m of guild().members.cache.values()) {
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

export async function getMember(id: string): Promise<GuildMember | null> {
  const g = guild();
  const cached = g.members.cache.get(id);
  if (cached) return cached;
  try {
    return await g.members.fetch(id);
  } catch {
    return null;
  }
}

export function listRoles(): RoleSummary[] {
  const g = guild();
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

export function roleMembers(roleId: string): { role: RoleSummary; members: MemberSummary[] } | null {
  const g = guild();
  const r = g.roles.cache.get(roleId);
  if (!r || r.id === g.id) return null;
  const members = [...r.members.values()].filter((m) => !m.user.bot).map(memberSummary);
  return {
    role: { id: r.id, name: r.name, color: r.hexColor, memberCount: members.length },
    members,
  };
}

export function listVoiceChannels(): VoiceChannelSummary[] {
  const g = guild();
  return [...g.channels.cache.values()]
    .filter((c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice)
    .sort((a, b) => ("position" in a && "position" in b ? a.position - b.position : 0))
    .map((c) => ({ id: c.id, name: c.name, parent: c.parent?.name ?? null }));
}

export function voiceChannelUrl(channelId: string): string {
  return `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${channelId}`;
}

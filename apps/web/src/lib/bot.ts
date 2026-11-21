import "server-only";
import type { GuildSummary, MemberSummary, NotifyRequest, RoleSummary, VoiceChannelSummary } from "@meet/shared";
import { env } from "./env";
import { HttpError } from "./session";

async function botFetch<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  const res = await fetch(new URL(path, env().BOT_API_URL), {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-internal-secret": env().INTERNAL_API_SECRET,
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  }).catch((err) => {
    console.error(`Bot API ${path} unreachable:`, err);
    throw new HttpError(503, "The Discord bot is not reachable right now");
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    console.error(`Bot API ${path} returned ${res.status}: ${await res.text()}`);
    throw new HttpError(502, "The Discord bot returned an error");
  }
  return (await res.json()) as T;
}

const g = (guildId: string) => `/guilds/${encodeURIComponent(guildId)}`;

export const bot = {
  /** Servers the user shares with the bot. */
  userGuilds: (userId: string) =>
    botFetch<GuildSummary[]>(`/users/${encodeURIComponent(userId)}/guilds`).then((r) => r ?? []),
  searchMembers: (guildId: string, q: string) =>
    botFetch<MemberSummary[]>(`${g(guildId)}/members?q=${encodeURIComponent(q)}&limit=20`).then((r) => r ?? []),
  /** Null when the user is not in the server, or the bot is not. */
  getMember: (guildId: string, id: string) => botFetch<MemberSummary>(`${g(guildId)}/members/${encodeURIComponent(id)}`),
  lookupMembers: (guildId: string, ids: string[]) =>
    ids.length
      ? botFetch<MemberSummary[]>(`${g(guildId)}/members/lookup`, { method: "POST", body: JSON.stringify({ ids }) }).then(
          (r) => r ?? [],
        )
      : Promise.resolve([] as MemberSummary[]),
  listRoles: (guildId: string) => botFetch<RoleSummary[]>(`${g(guildId)}/roles`).then((r) => r ?? []),
  roleMembers: (guildId: string, id: string) =>
    botFetch<{ role: RoleSummary; members: MemberSummary[] }>(`${g(guildId)}/roles/${encodeURIComponent(id)}/members`),
  listVoiceChannels: (guildId: string) =>
    botFetch<VoiceChannelSummary[]>(`${g(guildId)}/voice-channels`).then((r) => r ?? []),
  /** Best effort: a failed notify must not fail the meeting change itself. */
  notify: async (req: NotifyRequest) => {
    try {
      await botFetch("/notify", { method: "POST", body: JSON.stringify(req) });
    } catch (err) {
      console.error("notify failed:", err);
    }
  },
};

import "server-only";
import type { MemberSummary, NotifyRequest, RoleSummary, VoiceChannelSummary } from "@meet/shared";
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

export const bot = {
  searchMembers: (q: string) => botFetch<MemberSummary[]>(`/members?q=${encodeURIComponent(q)}&limit=20`).then((r) => r ?? []),
  getMember: (id: string) => botFetch<MemberSummary>(`/members/${encodeURIComponent(id)}`),
  lookupMembers: (ids: string[]) =>
    ids.length
      ? botFetch<MemberSummary[]>("/members/lookup", { method: "POST", body: JSON.stringify({ ids }) }).then((r) => r ?? [])
      : Promise.resolve([] as MemberSummary[]),
  listRoles: () => botFetch<RoleSummary[]>("/roles").then((r) => r ?? []),
  roleMembers: (id: string) => botFetch<{ role: RoleSummary; members: MemberSummary[] }>(`/roles/${encodeURIComponent(id)}/members`),
  listVoiceChannels: () => botFetch<VoiceChannelSummary[]>("/voice-channels").then((r) => r ?? []),
  /** Best effort: a failed notify must not fail the meeting change itself. */
  notify: async (req: NotifyRequest) => {
    try {
      await botFetch("/notify", { method: "POST", body: JSON.stringify(req) });
    } catch (err) {
      console.error("notify failed:", err);
    }
  },
};

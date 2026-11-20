import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { collections } from "@meet/shared/db";
import { suggestInputSchema, suggestTimes, type SuggestParticipant } from "@meet/shared";
import { handler, readJson } from "@/lib/api";
import { apiSession, HttpError } from "@/lib/session";
import { bot } from "@/lib/bot";
import { loadMeeting, meetingsForUser } from "@/lib/meetings";

const MAX_RANGE_MS = 14 * 24 * 3600_000;

export const POST = handler(async (req: Request) => {
  const s = await apiSession();
  const input = suggestInputSchema.parse(await readJson(req));
  const rangeStart = Math.max(input.rangeStart.getTime(), Date.now());
  const rangeEnd = input.rangeEnd.getTime();
  if (rangeEnd <= rangeStart) throw new HttpError(400, "Pick a range in the future");
  if (rangeEnd - rangeStart > MAX_RANGE_MS) throw new HttpError(400, "Range can be at most 14 days");

  // Who takes part: the organizer (required), direct invites, and role members.
  // When editing, roles already on the meeting use their captured members.
  const existing = input.excludeMeetingId ? await loadMeeting(input.excludeMeetingId).catch(() => undefined) : undefined;
  const required = new Map<string, boolean>([[s.sub, true]]);
  const add = (id: string, req: boolean) => required.set(id, (required.get(id) ?? false) || req);
  for (const u of input.users) add(u.discordId, u.required);
  for (const r of input.roles) {
    const prev = existing?.organizerId === s.sub ? existing.roleInvites.find((x) => x.roleId === r.roleId) : undefined;
    const ids = prev ? prev.memberIds : ((await bot.roleMembers(r.roleId))?.members.map((m) => m.id) ?? []);
    for (const id of ids) add(id, r.required);
  }
  if (required.size > 300) throw new HttpError(400, "Too many people for suggestions");
  const ids = [...required.keys()];

  const { users, availability, meetings } = await collections();
  const [userDocs, availDocs, busyDocs] = await Promise.all([
    users.find({ discordId: { $in: ids } }, { projection: { discordId: 1, timezone: 1 } }).toArray(),
    availability.find({ discordId: { $in: ids } }).toArray(),
    meetings
      .find(
        {
          status: "scheduled",
          start: { $lt: new Date(rangeEnd) },
          end: { $gt: new Date(rangeStart) },
          $or: ids.flatMap((id) => meetingsForUser(id, false).$or ?? []),
          ...(input.excludeMeetingId && ObjectId.isValid(input.excludeMeetingId)
            ? { _id: { $ne: new ObjectId(input.excludeMeetingId) } }
            : {}),
        },
        { projection: { start: 1, end: 1, organizerId: 1, guests: 1 } },
      )
      .toArray(),
  ]);

  const tz = new Map(userDocs.map((u) => [u.discordId, u.timezone]));
  const blocks = new Map(availDocs.map((a) => [a.discordId, a.blocks]));

  const participants: SuggestParticipant[] = ids.map((id) => ({
    discordId: id,
    required: required.get(id)!,
    timezone: tz.get(id) ?? null,
    blocks: blocks.get(id) ?? [],
    busy: busyDocs
      .filter((m) => m.organizerId === id || m.guests.some((g) => g.discordId === id && g.rsvp !== "declined"))
      .map((m) => ({ start: m.start.getTime(), end: m.end.getTime() })),
  }));

  const result = suggestTimes({ participants, rangeStart, rangeEnd, durationMin: input.durationMin, limit: 6 });
  const noData = participants.filter((p) => !p.timezone || p.blocks.length === 0).map((p) => p.discordId);

  return NextResponse.json({
    slots: result.slots,
    heatmap: result.heatmap.map((h) => ({ start: h.start, score: h.score, unavailable: h.unavailable.length })),
    participantCount: participants.length,
    requiredCount: participants.filter((p) => p.required).length,
    withoutAvailability: noData,
  });
});

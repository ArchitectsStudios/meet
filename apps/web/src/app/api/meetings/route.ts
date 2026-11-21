import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { collections } from "@meet/shared/db";
import { meetingInputSchema, type MeetingDoc } from "@meet/shared";
import { handler, readJson } from "@/lib/api";
import { apiSession, HttpError } from "@/lib/session";
import { bot } from "@/lib/bot";
import { requireGuildMember } from "@/lib/guilds";
import { buildGuests, initialReminderSentAt, meetingsForUser, resolveInvites, serializeMeeting } from "@/lib/meetings";

const rangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

/** Meetings overlapping [from, to) that the user organizes or is invited to. */
export const GET = handler(async (req: NextRequest) => {
  const s = await apiSession();
  const { from, to } = rangeSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  if (to.getTime() - from.getTime() > 62 * 24 * 3600_000) throw new HttpError(400, "Range too long");
  const { meetings } = await collections();
  const list = await meetings
    .find({ ...meetingsForUser(s.sub), status: "scheduled", start: { $lt: to }, end: { $gt: from } })
    .sort({ start: 1 })
    .limit(500)
    .toArray();
  return NextResponse.json(list.map(serializeMeeting));
});

export const POST = handler(async (req: Request) => {
  const s = await apiSession();
  const input = meetingInputSchema.parse(await readJson(req));
  if (input.end.getTime() < Date.now()) throw new HttpError(400, "That meeting would already be over");

  await requireGuildMember(s.sub, input.guildId);
  const resolved = await resolveInvites(input.guildId, input);
  const { guests, roleInvites } = buildGuests(s.sub, resolved);

  const now = new Date();
  const doc: MeetingDoc = {
    title: input.title,
    agenda: input.agenda,
    organizerId: s.sub,
    organizerName: s.name,
    guildId: input.guildId,
    start: input.start,
    end: input.end,
    voiceChannelId: input.voiceChannelId,
    status: "scheduled",
    reminderMinutes: input.reminderMinutes,
    reminderSentAt: initialReminderSentAt(input.start, input.reminderMinutes, now),
    guests,
    roleInvites,
    createdAt: now,
    updatedAt: now,
  };
  const { meetings } = await collections();
  const { insertedId } = await meetings.insertOne(doc);

  if (guests.length) await bot.notify({ meetingId: insertedId.toString(), type: "invite" });
  return NextResponse.json({ id: insertedId.toString() }, { status: 201 });
});

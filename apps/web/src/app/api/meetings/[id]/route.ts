import { NextResponse } from "next/server";
import { collections } from "@meet/shared/db";
import { meetingInputSchema } from "@meet/shared";
import { handler, readJson } from "@/lib/api";
import { apiSession, HttpError } from "@/lib/session";
import { bot } from "@/lib/bot";
import { buildGuests, canView, initialReminderSentAt, loadMeeting, resolveInvites, serializeMeeting } from "@/lib/meetings";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const s = await apiSession();
  const m = await loadMeeting((await ctx.params).id);
  if (!canView(m, s.sub)) throw new HttpError(404, "Meeting not found");
  return NextResponse.json(serializeMeeting(m));
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const s = await apiSession();
  const existing = await loadMeeting((await ctx.params).id);
  if (existing.organizerId !== s.sub) throw new HttpError(403, "Only the organizer can edit this meeting");
  if (existing.status !== "scheduled") throw new HttpError(409, "This meeting was cancelled");

  const input = meetingInputSchema.parse(await readJson(req));
  const resolved = await resolveInvites(existing.guildId, input, existing);
  const { guests, roleInvites, addedIds, removedIds } = buildGuests(s.sub, resolved, existing);

  const timeChanged = existing.start.getTime() !== input.start.getTime() || existing.end.getTime() !== input.end.getTime();
  const detailsChanged =
    timeChanged ||
    existing.title !== input.title ||
    existing.agenda !== input.agenda ||
    existing.voiceChannelId !== input.voiceChannelId;

  const now = new Date();
  const reminderReset = timeChanged || existing.reminderMinutes !== input.reminderMinutes;
  const { meetings } = await collections();
  await meetings.updateOne(
    { _id: existing._id },
    {
      $set: {
        title: input.title,
        agenda: input.agenda,
        start: input.start,
        end: input.end,
        voiceChannelId: input.voiceChannelId,
        reminderMinutes: input.reminderMinutes,
        ...(reminderReset ? { reminderSentAt: initialReminderSentAt(input.start, input.reminderMinutes, now) } : {}),
        guests,
        roleInvites,
        updatedAt: now,
      },
    },
  );

  const id = existing._id!.toString();
  const removed = existing.guests
    .filter((g) => removedIds.includes(g.discordId))
    .map((g) => ({ discordId: g.discordId, displayName: g.displayName }));
  const kept = guests.filter((g) => !addedIds.includes(g.discordId)).map((g) => g.discordId);

  if (addedIds.length) await bot.notify({ meetingId: id, type: "invite", discordIds: addedIds });
  if (detailsChanged && kept.length) {
    await bot.notify({ meetingId: id, type: "update", discordIds: kept, removed });
  } else if (removed.length) {
    // Only the "no longer invited" DMs: an empty discordIds list means no update DMs.
    await bot.notify({ meetingId: id, type: "update", discordIds: [], removed });
  }

  return NextResponse.json({ ok: true });
});

/** Cancels the meeting. The record stays so ICS feeds can publish STATUS:CANCELLED. */
export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const s = await apiSession();
  const existing = await loadMeeting((await ctx.params).id);
  if (existing.organizerId !== s.sub) throw new HttpError(403, "Only the organizer can cancel this meeting");
  if (existing.status === "cancelled") return NextResponse.json({ ok: true });

  const { meetings } = await collections();
  await meetings.updateOne({ _id: existing._id }, { $set: { status: "cancelled", updatedAt: new Date() } });
  if (existing.guests.length) await bot.notify({ meetingId: existing._id!.toString(), type: "cancel" });
  return NextResponse.json({ ok: true });
});

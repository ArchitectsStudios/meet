import { ObjectId } from "mongodb";
import { collections } from "@meet/shared/db";
import type { Guest, MeetingDoc, NotifyRequest } from "@meet/shared";
import { client } from "./discord";
import { buildMeetingMessage, type MessageKind } from "./messages";

async function dmGuest(kind: MessageKind, meeting: MeetingDoc, guest: Guest): Promise<void> {
  const { meetings } = await collections();
  // Removed guests are no longer in the meeting document, so there is nothing to record for them.
  const record = kind !== "removed";
  try {
    const user = await client.users.fetch(guest.discordId);
    const msg = await user.send(buildMeetingMessage(kind, meeting, guest));
    if (!record) return;
    const set: Record<string, unknown> = { "guests.$[g].dmStatus": "ok" };
    // Keep a pointer to the newest message with RSVP buttons.
    if (kind !== "cancel") {
      set["guests.$[g].dmChannelId"] = msg.channelId;
      set["guests.$[g].dmMessageId"] = msg.id;
    }
    await meetings.updateOne({ _id: meeting._id }, { $set: set }, { arrayFilters: [{ "g.discordId": guest.discordId }] });
  } catch (err) {
    // Usually error 50007: the user has DMs closed or shares no server with the bot.
    console.warn(`DM to ${guest.discordId} failed (${kind}):`, (err as Error).message);
    if (!record) return;
    await meetings.updateOne(
      { _id: meeting._id },
      { $set: { "guests.$[g].dmStatus": "failed" } },
      { arrayFilters: [{ "g.discordId": guest.discordId }] },
    );
  }
}

/** Sends DMs one guest at a time. discord.js queues requests to respect rate limits. */
export async function sendToGuests(kind: MessageKind, meeting: MeetingDoc, guests: Guest[]): Promise<void> {
  for (const g of guests) {
    await dmGuest(kind, meeting, g);
  }
}

export async function handleNotify(req: NotifyRequest): Promise<{ sent: number }> {
  const { meetings } = await collections();
  const meeting = await meetings.findOne({ _id: new ObjectId(req.meetingId) });
  if (!meeting) return { sent: 0 };

  // Missing list = every guest; empty list = nobody.
  const only = (ids?: string[]) => (g: Guest) => ids === undefined || ids.includes(g.discordId);
  let targets: Guest[];
  switch (req.type) {
    case "invite":
    case "update":
      targets = meeting.guests.filter(only(req.discordIds));
      break;
    case "cancel":
      targets = meeting.guests.filter((g) => g.rsvp !== "declined");
      break;
  }
  await sendToGuests(req.type, meeting, targets);

  const removed: Guest[] = (req.removed ?? []).map((r) => ({
    discordId: r.discordId,
    displayName: r.displayName,
    required: false,
    direct: null,
    roleIds: [],
    rsvp: "pending",
    dmStatus: "pending",
  }));
  await sendToGuests("removed", meeting, removed);

  return { sent: targets.length + removed.length };
}

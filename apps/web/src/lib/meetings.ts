import "server-only";
import { ObjectId, type Filter } from "mongodb";
import { collections } from "@meet/shared/db";
import {
  mergeGuests,
  type DirectInvite,
  type MeetingDoc,
  type MeetingInput,
  type ResolvedRoleInvite,
} from "@meet/shared";
import { bot } from "./bot";
import { HttpError } from "./session";

/** Meetings a user organizes or is invited to (and has not declined, unless includeDeclined). */
export function meetingsForUser(discordId: string, includeDeclined = true): Filter<MeetingDoc> {
  return {
    $or: [
      { organizerId: discordId },
      includeDeclined
        ? { "guests.discordId": discordId }
        : { guests: { $elemMatch: { discordId, rsvp: { $ne: "declined" } } } },
    ],
  };
}

export function parseId(id: string): ObjectId {
  if (!ObjectId.isValid(id)) throw new HttpError(404, "Meeting not found");
  return new ObjectId(id);
}

export async function loadMeeting(id: string): Promise<MeetingDoc> {
  const { meetings } = await collections();
  const m = await meetings.findOne({ _id: parseId(id) });
  if (!m) throw new HttpError(404, "Meeting not found");
  return m;
}

export function canView(m: MeetingDoc, discordId: string): boolean {
  return m.organizerId === discordId || m.guests.some((g) => g.discordId === discordId);
}

/**
 * Resolves invitees to display names and role members through the bot.
 * Roles already on the meeting keep their captured members (no sync). New roles are fetched now.
 */
export async function resolveInvites(
  guildId: string,
  input: Pick<MeetingInput, "users" | "roles">,
  existing?: MeetingDoc,
): Promise<{ users: DirectInvite[]; roles: ResolvedRoleInvite[] }> {
  const knownNames = new Map(existing?.guests.map((g) => [g.discordId, g.displayName]) ?? []);

  const lookedUp = await bot.lookupMembers(guildId, input.users.map((u) => u.discordId).filter((id) => !knownNames.has(id)));
  for (const m of lookedUp) knownNames.set(m.id, m.displayName);

  const users: DirectInvite[] = input.users.map((u) => {
    const name = knownNames.get(u.discordId);
    if (!name) throw new HttpError(400, `User ${u.discordId} is not a member of the server`);
    return { discordId: u.discordId, displayName: name, required: u.required };
  });

  const roles: ResolvedRoleInvite[] = await Promise.all(
    input.roles.map(async (r) => {
      const prev = existing?.roleInvites.find((x) => x.roleId === r.roleId);
      if (prev) {
        return {
          roleId: r.roleId,
          roleName: prev.roleName,
          required: r.required,
          members: prev.memberIds.map((id) => ({ discordId: id, displayName: knownNames.get(id) ?? id })),
        };
      }
      const fetched = await bot.roleMembers(guildId, r.roleId);
      if (!fetched) throw new HttpError(400, `Role ${r.roleId} does not exist`);
      return {
        roleId: r.roleId,
        roleName: fetched.role.name,
        required: r.required,
        members: fetched.members.map((m) => ({ discordId: m.id, displayName: m.displayName })),
      };
    }),
  );

  return { users, roles };
}

export function buildGuests(organizerId: string, resolved: Awaited<ReturnType<typeof resolveInvites>>, existing?: MeetingDoc) {
  return mergeGuests(organizerId, resolved.users, resolved.roles, existing?.guests ?? []);
}

/** A reminder whose time has already passed when the meeting is saved would only repeat the invite. */
export function initialReminderSentAt(start: Date, reminderMinutes: number, now = new Date()): Date | null {
  if (reminderMinutes <= 0) return null;
  return start.getTime() - reminderMinutes * 60_000 <= now.getTime() ? now : null;
}

/** JSON shape sent to the browser. */
export function serializeMeeting(m: MeetingDoc) {
  return {
    ...m,
    _id: m._id!.toString(),
    start: m.start.toISOString(),
    end: m.end.toISOString(),
    reminderSentAt: m.reminderSentAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

export type MeetingJson = ReturnType<typeof serializeMeeting>;

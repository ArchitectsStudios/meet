import type { Guest, RoleInvite } from "./types";

export interface DirectInvite {
  discordId: string;
  displayName: string;
  required: boolean;
}

export interface ResolvedRoleInvite {
  roleId: string;
  roleName: string;
  required: boolean;
  members: { discordId: string; displayName: string }[];
}

export interface MergeResult {
  guests: Guest[];
  roleInvites: RoleInvite[];
  /** Guests who were not on the previous list. */
  addedIds: string[];
  /** Previous guests who are no longer invited. */
  removedIds: string[];
}

/**
 * Builds the guest list from direct and role invites.
 * - A person invited directly and through roles becomes one guest. They are required if any invite is required.
 * - The organizer is never a guest.
 * - Existing guests keep their RSVP and DM state.
 */
export function mergeGuests(
  organizerId: string,
  users: DirectInvite[],
  roles: ResolvedRoleInvite[],
  existing: Guest[] = [],
): MergeResult {
  const prev = new Map(existing.map((g) => [g.discordId, g]));
  const next = new Map<string, Guest>();

  const upsert = (discordId: string, displayName: string): Guest => {
    let g = next.get(discordId);
    if (!g) {
      const old = prev.get(discordId);
      g = {
        discordId,
        displayName,
        required: false,
        direct: null,
        roleIds: [],
        rsvp: old?.rsvp ?? "pending",
        dmStatus: old?.dmStatus ?? "pending",
        ...(old?.dmChannelId ? { dmChannelId: old.dmChannelId } : {}),
        ...(old?.dmMessageId ? { dmMessageId: old.dmMessageId } : {}),
      };
      next.set(discordId, g);
    }
    return g;
  };

  for (const u of users) {
    if (u.discordId === organizerId) continue;
    const g = upsert(u.discordId, u.displayName);
    g.direct = { required: (g.direct?.required ?? false) || u.required };
    g.required ||= u.required;
  }

  const roleInvites: RoleInvite[] = [];
  for (const r of roles) {
    const memberIds: string[] = [];
    for (const m of r.members) {
      memberIds.push(m.discordId);
      if (m.discordId === organizerId) continue;
      const g = upsert(m.discordId, m.displayName);
      if (!g.roleIds.includes(r.roleId)) g.roleIds.push(r.roleId);
      g.required ||= r.required;
    }
    roleInvites.push({ roleId: r.roleId, roleName: r.roleName, required: r.required, memberIds });
  }

  const guests = [...next.values()];
  return {
    guests,
    roleInvites,
    addedIds: guests.filter((g) => !prev.has(g.discordId)).map((g) => g.discordId),
    removedIds: existing.filter((g) => !next.has(g.discordId)).map((g) => g.discordId),
  };
}

import type { ObjectId } from "mongodb";

/** Day of week, 0 = Monday ... 6 = Sunday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type AvailabilityKind = "unavailable" | "ideal";

/** A block in a user's weekly template, in the user's local time. */
export interface AvailabilityBlock {
  day: Weekday;
  /** Minutes after local midnight, 0..1439. */
  startMin: number;
  /** Minutes after local midnight, 1..1440. Must be greater than startMin. */
  endMin: number;
  kind: AvailabilityKind;
}

export interface UserDoc {
  _id?: ObjectId;
  discordId: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  /** IANA timezone, for example "Europe/London". */
  timezone: string | null;
  onboardedAt: Date | null;
  /** Secret token for the private ICS feed URL. Reset it to revoke old subscriptions. */
  icsToken: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AvailabilityDoc {
  _id?: ObjectId;
  discordId: string;
  blocks: AvailabilityBlock[];
  updatedAt: Date;
}

export type Rsvp = "pending" | "accepted" | "declined" | "maybe";
export type DmStatus = "pending" | "ok" | "failed";

export interface Guest {
  discordId: string;
  displayName: string;
  /** Effective flag: true when the direct invite or any role invite is required. */
  required: boolean;
  /** Set when the guest was invited by name. */
  direct: { required: boolean } | null;
  /** Roles through which the guest was invited. */
  roleIds: string[];
  rsvp: Rsvp;
  dmStatus: DmStatus;
  /** Channel and message of the invite DM, so the bot can edit it after an RSVP. */
  dmChannelId?: string;
  dmMessageId?: string;
}

export interface RoleInvite {
  roleId: string;
  roleName: string;
  required: boolean;
  /** Members captured when the role was invited. Not synced later. */
  memberIds: string[];
}

export type MeetingStatus = "scheduled" | "cancelled";

export interface MeetingDoc {
  _id?: ObjectId;
  title: string;
  agenda: string;
  organizerId: string;
  organizerName: string;
  /** Discord server the meeting belongs to. Guests, roles and the voice channel all come from it. */
  guildId: string;
  start: Date;
  end: Date;
  voiceChannelId: string | null;
  status: MeetingStatus;
  reminderMinutes: number;
  reminderSentAt: Date | null;
  guests: Guest[];
  roleInvites: RoleInvite[];
  createdAt: Date;
  updatedAt: Date;
}

export type NotifyType = "invite" | "update" | "cancel";

export interface NotifyRequest {
  meetingId: string;
  type: NotifyType;
  /** For "invite" and "update": only these guests get the DM. Missing means every guest; an empty list means nobody. */
  discordIds?: string[];
  /** Guests taken off the meeting by an edit. They get a "no longer invited" DM. */
  removed?: { discordId: string; displayName: string }[];
}

/** Shapes returned by the bot's internal API. */
export interface GuildSummary {
  id: string;
  name: string;
  iconUrl: string | null;
}

export interface MemberSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}

export interface RoleSummary {
  id: string;
  name: string;
  color: string;
  memberCount: number;
}

export interface VoiceChannelSummary {
  id: string;
  name: string;
  parent: string | null;
}

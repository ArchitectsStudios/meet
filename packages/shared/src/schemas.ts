import { z } from "zod";

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const timezoneSchema = z.string().min(1).refine(isValidTimezone, "Unknown timezone");

const snowflake = z.string().regex(/^\d{5,25}$/, "Invalid Discord ID");

export const availabilityBlockSchema = z
  .object({
    day: z.number().int().min(0).max(6),
    startMin: z.number().int().min(0).max(1439),
    endMin: z.number().int().min(1).max(1440),
    kind: z.enum(["unavailable", "ideal"]),
  })
  .refine((b) => b.endMin > b.startMin, "endMin must be after startMin");

export const availabilityInputSchema = z.object({
  guildId: snowflake,
  blocks: z.array(availabilityBlockSchema).max(500),
});

export const settingsInputSchema = z.object({
  timezone: timezoneSchema,
});

export const meetingInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    /** Server for a new meeting. Ignored on edit: a meeting cannot move between servers. */
    guildId: snowflake,
    agenda: z.string().max(10_000).default(""),
    start: z.coerce.date(),
    end: z.coerce.date(),
    voiceChannelId: snowflake.nullable().default(null),
    reminderMinutes: z.number().int().min(0).max(7 * 24 * 60).default(15),
    users: z
      .array(z.object({ discordId: snowflake, required: z.boolean() }))
      .max(200)
      .default([]),
    roles: z
      .array(z.object({ roleId: snowflake, required: z.boolean() }))
      .max(25)
      .default([]),
  })
  .refine((m) => m.end > m.start, { message: "End must be after start", path: ["end"] })
  .refine((m) => m.end.getTime() - m.start.getTime() <= 24 * 60 * 60 * 1000, {
    message: "Meetings can be at most 24 hours long",
    path: ["end"],
  });

export type MeetingInput = z.infer<typeof meetingInputSchema>;

export const rsvpInputSchema = z.object({
  rsvp: z.enum(["accepted", "declined", "maybe"]),
});

export const suggestInputSchema = z.object({
  /** Server used to look up role members. */
  guildId: snowflake,
  users: z.array(z.object({ discordId: snowflake, required: z.boolean() })).max(200).default([]),
  roles: z.array(z.object({ roleId: snowflake, required: z.boolean() })).max(25).default([]),
  durationMin: z.number().int().min(15).max(24 * 60),
  rangeStart: z.coerce.date(),
  rangeEnd: z.coerce.date(),
  /** Meeting being edited; its own time is not treated as busy. */
  excludeMeetingId: z.string().optional(),
});

export const notifyRequestSchema = z.object({
  meetingId: z.string().regex(/^[a-f0-9]{24}$/),
  type: z.enum(["invite", "update", "cancel"]),
  discordIds: z.array(snowflake).optional(),
  removed: z.array(z.object({ discordId: snowflake, displayName: z.string() })).optional(),
});

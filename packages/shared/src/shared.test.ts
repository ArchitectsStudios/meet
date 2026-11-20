import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { expandWeekly, covers, normalizeBlocks } from "./time";
import { suggestTimes, type SuggestParticipant } from "./suggest";
import { mergeGuests } from "./guests";
import { buildIcs, icsEscape, icsFold } from "./ics";
import { meetingInputSchema, availabilityBlockSchema } from "./schemas";
import type { AvailabilityBlock, MeetingDoc } from "./types";
import { ObjectId } from "mongodb";

const ms = (iso: string, zone = "utc") => DateTime.fromISO(iso, { zone }).toMillis();

describe("expandWeekly", () => {
  it("keeps the same wall-clock time across a DST change (Europe/London, late October)", () => {
    // 2026-10-25 is the Sunday clocks go back in the UK. Monday 19th is BST, Monday 26th is GMT.
    const blocks: AvailabilityBlock[] = [{ day: 0, startMin: 9 * 60, endMin: 17 * 60, kind: "ideal" }];
    const out = expandWeekly(blocks, "Europe/London", ms("2026-10-19T00:00:00Z"), ms("2026-10-27T00:00:00Z"));
    expect(out).toHaveLength(2);
    expect(new Date(out[0]!.start).toISOString()).toBe("2026-10-19T08:00:00.000Z"); // 09:00 BST
    expect(new Date(out[1]!.start).toISOString()).toBe("2026-10-26T09:00:00.000Z"); // 09:00 GMT
  });

  it("handles an end-of-day block and clips to the range", () => {
    const blocks: AvailabilityBlock[] = [{ day: 2, startMin: 22 * 60, endMin: 1440, kind: "unavailable" }];
    // Wednesday 2026-11-18, UTC
    const out = expandWeekly(blocks, "UTC", ms("2026-11-18T23:00:00Z"), ms("2026-11-19T12:00:00Z"));
    expect(out).toEqual([
      { start: ms("2026-11-18T23:00:00Z"), end: ms("2026-11-19T00:00:00Z"), kind: "unavailable" },
    ]);
  });

  it("maps day 0 to Monday in the user's timezone, not UTC", () => {
    // Monday 00:00-01:00 in Tokyo is Sunday 15:00-16:00 UTC.
    const blocks: AvailabilityBlock[] = [{ day: 0, startMin: 0, endMin: 60, kind: "ideal" }];
    const out = expandWeekly(blocks, "Asia/Tokyo", ms("2026-11-22T00:00:00Z"), ms("2026-11-23T00:00:00Z"));
    expect(out[0]!.start).toBe(ms("2026-11-22T15:00:00Z"));
  });
});

describe("covers / normalizeBlocks", () => {
  it("detects gaps", () => {
    expect(covers([{ start: 0, end: 5 }, { start: 5, end: 10 }], { start: 1, end: 9 })).toBe(true);
    expect(covers([{ start: 0, end: 4 }, { start: 5, end: 10 }], { start: 1, end: 9 })).toBe(false);
  });

  it("merges touching blocks of the same kind only", () => {
    const out = normalizeBlocks([
      { day: 1, startMin: 60, endMin: 120, kind: "ideal" },
      { day: 1, startMin: 0, endMin: 60, kind: "ideal" },
      { day: 1, startMin: 120, endMin: 180, kind: "unavailable" },
    ]);
    expect(out).toEqual([
      { day: 1, startMin: 0, endMin: 120, kind: "ideal" },
      { day: 1, startMin: 120, endMin: 180, kind: "unavailable" },
    ]);
  });
});

describe("suggestTimes", () => {
  // Monday 2026-11-23, UTC
  const rangeStart = ms("2026-11-23T08:00:00Z");
  const rangeEnd = ms("2026-11-23T12:00:00Z");
  const person = (id: string, required: boolean, blocks: AvailabilityBlock[], busy = [] as { start: number; end: number }[]): SuggestParticipant => ({
    discordId: id,
    required,
    timezone: "UTC",
    blocks,
    busy,
  });

  it("drops slots where a required guest is unavailable and prefers ideal time", () => {
    const res = suggestTimes({
      rangeStart,
      rangeEnd,
      durationMin: 60,
      participants: [
        person("1", true, [
          { day: 0, startMin: 8 * 60, endMin: 9 * 60, kind: "unavailable" },
          { day: 0, startMin: 10 * 60, endMin: 12 * 60, kind: "ideal" },
        ]),
        person("2", false, [{ day: 0, startMin: 10 * 60, endMin: 11 * 60, kind: "ideal" }]),
      ],
    });
    const byStart = new Map(res.heatmap.map((s) => [s.start, s]));
    expect(byStart.get(ms("2026-11-23T08:00:00Z"))!.score).toBeNull();
    expect(byStart.get(ms("2026-11-23T08:30:00Z"))!.score).toBeNull();
    expect(res.slots[0]!.start).toBe(ms("2026-11-23T10:00:00Z"));
    expect(res.slots[0]!.score).toBe(4); // 3 required ideal + 1 optional ideal
  });

  it("penalises optional guests who cannot come and blocks on required busy time", () => {
    const res = suggestTimes({
      rangeStart,
      rangeEnd,
      durationMin: 60,
      participants: [
        person("1", true, [], [{ start: ms("2026-11-23T08:00:00Z"), end: ms("2026-11-23T10:00:00Z") }]),
        person("2", false, [{ day: 0, startMin: 10 * 60, endMin: 11 * 60, kind: "unavailable" }]),
      ],
    });
    expect(res.heatmap.find((s) => s.start === ms("2026-11-23T09:00:00Z"))!.score).toBeNull();
    const ten = res.heatmap.find((s) => s.start === ms("2026-11-23T10:00:00Z"))!;
    expect(ten.score).toBe(-2);
    expect(ten.unavailable).toEqual(["2"]);
    expect(res.slots[0]!.start).toBe(ms("2026-11-23T11:00:00Z"));
  });

  it("returns non-overlapping suggestions", () => {
    const res = suggestTimes({ rangeStart, rangeEnd, durationMin: 60, participants: [], limit: 10 });
    for (let i = 1; i < res.slots.length; i++) {
      expect(Math.abs(res.slots[i]!.start - res.slots[i - 1]!.start)).toBeGreaterThanOrEqual(60 * 60_000);
    }
    expect(res.slots).toHaveLength(4);
  });
});

describe("mergeGuests", () => {
  it("merges direct and role invites into one guest and keeps RSVPs", () => {
    const res = mergeGuests(
      "org",
      [{ discordId: "a", displayName: "A", required: false }],
      [
        {
          roleId: "r1",
          roleName: "Team",
          required: true,
          members: [
            { discordId: "a", displayName: "A" },
            { discordId: "b", displayName: "B" },
            { discordId: "org", displayName: "Organizer" },
          ],
        },
      ],
      [
        { discordId: "a", displayName: "A", required: false, direct: { required: false }, roleIds: [], rsvp: "accepted", dmStatus: "ok" },
        { discordId: "z", displayName: "Z", required: false, direct: { required: false }, roleIds: [], rsvp: "pending", dmStatus: "ok" },
      ],
    );
    const a = res.guests.find((g) => g.discordId === "a")!;
    expect(a.required).toBe(true);
    expect(a.direct).toEqual({ required: false });
    expect(a.roleIds).toEqual(["r1"]);
    expect(a.rsvp).toBe("accepted");
    expect(res.guests.map((g) => g.discordId).sort()).toEqual(["a", "b"]);
    expect(res.addedIds).toEqual(["b"]);
    expect(res.removedIds).toEqual(["z"]);
    expect(res.roleInvites[0]!.memberIds).toEqual(["a", "b", "org"]);
  });
});

describe("ics", () => {
  it("escapes and folds", () => {
    expect(icsEscape("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const folded = icsFold("X".repeat(200));
    expect(folded.split("\r\n ").every((l) => l.length <= 75)).toBe(true);
  });

  it("builds a feed with cancelled status and RSVP", () => {
    const id = new ObjectId();
    const meeting: MeetingDoc = {
      _id: id,
      title: "Sync, weekly",
      agenda: "1. Hello",
      organizerId: "org",
      organizerName: "Org",
      start: new Date("2026-11-23T10:00:00Z"),
      end: new Date("2026-11-23T11:00:00Z"),
      voiceChannelId: "123456",
      status: "cancelled",
      reminderMinutes: 15,
      reminderSentAt: null,
      guests: [{ discordId: "me", displayName: "Me", required: true, direct: { required: true }, roleIds: [], rsvp: "maybe", dmStatus: "ok" }],
      roleInvites: [],
      createdAt: new Date("2026-11-20T00:00:00Z"),
      updatedAt: new Date("2026-11-21T00:00:00Z"),
    };
    const ics = buildIcs([meeting], { appUrl: "https://meet.blam.network", guildId: "999", viewerId: "me" });
    expect(ics).toContain(`UID:${id.toString()}@meet.blam.network`);
    expect(ics).toContain("DTSTART:20261123T100000Z");
    expect(ics).toContain("SUMMARY:Sync\\, weekly");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("X-MEET-PARTSTAT:TENTATIVE");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("schemas", () => {
  it("rejects bad meeting input", () => {
    const bad = meetingInputSchema.safeParse({ title: "x", start: "2026-11-23T10:00:00Z", end: "2026-11-23T09:00:00Z" });
    expect(bad.success).toBe(false);
    expect(availabilityBlockSchema.safeParse({ day: 1, startMin: 60, endMin: 30, kind: "ideal" }).success).toBe(false);
  });
});

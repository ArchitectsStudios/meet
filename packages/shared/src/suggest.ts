import type { AvailabilityBlock } from "./types";
import { covers, expandWeekly, overlaps, type Interval } from "./time";

export interface SuggestParticipant {
  discordId: string;
  required: boolean;
  /** Null when the user has not set a timezone. Their availability is then unknown. */
  timezone: string | null;
  blocks: AvailabilityBlock[];
  /** Existing meetings for this user, in UTC. */
  busy: Interval[];
}

export interface SuggestOptions {
  participants: SuggestParticipant[];
  rangeStart: number;
  rangeEnd: number;
  durationMin: number;
  stepMin?: number;
  limit?: number;
}

export interface SlotScore {
  start: number;
  end: number;
  /** Null when a required participant cannot make it. */
  score: number | null;
  requiredIdeal: number;
  optionalIdeal: number;
  optionalUnavailable: number;
  /** IDs of participants who cannot make it (unavailable or busy). */
  unavailable: string[];
}

export interface SuggestResult {
  slots: SlotScore[];
  heatmap: SlotScore[];
}

export const SCORE_WEIGHTS = {
  requiredIdeal: 3,
  optionalIdeal: 1,
  optionalUnavailable: -2,
} as const;

/**
 * Scores each candidate start between rangeStart and rangeEnd.
 * A slot is dropped when any required participant is unavailable or already busy.
 * Otherwise score = 3 x required-ideal + 1 x optional-ideal - 2 x optional-unavailable.
 */
export function suggestTimes(opts: SuggestOptions): SuggestResult {
  const stepMs = (opts.stepMin ?? 30) * 60_000;
  const durMs = opts.durationMin * 60_000;
  const limit = opts.limit ?? 5;

  const expanded = opts.participants.map((p) => {
    const intervals = p.timezone ? expandWeekly(p.blocks, p.timezone, opts.rangeStart, opts.rangeEnd + durMs) : [];
    return {
      p,
      unavailable: intervals.filter((i) => i.kind === "unavailable"),
      ideal: intervals.filter((i) => i.kind === "ideal"),
    };
  });

  const heatmap: SlotScore[] = [];
  const firstStart = Math.ceil(opts.rangeStart / stepMs) * stepMs;
  for (let start = firstStart; start + durMs <= opts.rangeEnd; start += stepMs) {
    const slot: Interval = { start, end: start + durMs };
    let requiredIdeal = 0;
    let optionalIdeal = 0;
    let optionalUnavailable = 0;
    let blocked = false;
    const unavailable: string[] = [];

    for (const e of expanded) {
      const cannot = e.unavailable.some((i) => overlaps(i, slot)) || e.p.busy.some((i) => overlaps(i, slot));
      if (cannot) {
        unavailable.push(e.p.discordId);
        if (e.p.required) blocked = true;
        else optionalUnavailable++;
        continue;
      }
      if (covers(e.ideal, slot)) {
        if (e.p.required) requiredIdeal++;
        else optionalIdeal++;
      }
    }

    const score = blocked
      ? null
      : SCORE_WEIGHTS.requiredIdeal * requiredIdeal +
        SCORE_WEIGHTS.optionalIdeal * optionalIdeal +
        SCORE_WEIGHTS.optionalUnavailable * optionalUnavailable;

    heatmap.push({ ...slot, score, requiredIdeal, optionalIdeal, optionalUnavailable, unavailable });
  }

  const slots = heatmap
    .filter((s) => s.score !== null)
    .sort((a, b) => b.score! - a.score! || a.start - b.start);

  // Skip candidates that overlap a better pick, so suggestions are distinct times.
  const picked: SlotScore[] = [];
  for (const s of slots) {
    if (picked.length >= limit) break;
    if (picked.some((p) => overlaps(p, s))) continue;
    picked.push(s);
  }

  return { slots: picked, heatmap };
}

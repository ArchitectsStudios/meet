import { DateTime } from "luxon";
import type { AvailabilityBlock, AvailabilityKind } from "./types";

export interface Interval {
  /** Epoch milliseconds, inclusive. */
  start: number;
  /** Epoch milliseconds, exclusive. */
  end: number;
}

export interface KindInterval extends Interval {
  kind: AvailabilityKind;
}

/** Local wall-clock minute in a zone, as a UTC epoch ms. Handles DST gaps by moving forward. */
function localMinuteToMillis(day: DateTime, minute: number): number {
  if (minute >= 1440) {
    return day.plus({ days: 1 }).startOf("day").toMillis();
  }
  return day.set({ hour: Math.floor(minute / 60), minute: minute % 60, second: 0, millisecond: 0 }).toMillis();
}

/**
 * Turns a weekly template (local time in `timezone`) into concrete UTC intervals
 * that overlap [rangeStart, rangeEnd). Each date is resolved on its own, so DST changes
 * keep blocks at the same wall-clock time.
 */
export function expandWeekly(
  blocks: AvailabilityBlock[],
  timezone: string,
  rangeStart: number,
  rangeEnd: number,
): KindInterval[] {
  if (blocks.length === 0 || rangeEnd <= rangeStart) return [];
  const out: KindInterval[] = [];
  let day = DateTime.fromMillis(rangeStart, { zone: timezone }).startOf("day").minus({ days: 1 });
  const last = DateTime.fromMillis(rangeEnd, { zone: timezone }).startOf("day").plus({ days: 1 });
  while (day <= last) {
    const weekday = day.weekday - 1; // Luxon: 1 = Monday
    for (const b of blocks) {
      if (b.day !== weekday) continue;
      const start = localMinuteToMillis(day, b.startMin);
      const end = localMinuteToMillis(day, b.endMin);
      if (end <= rangeStart || start >= rangeEnd || end <= start) continue;
      out.push({ start: Math.max(start, rangeStart), end: Math.min(end, rangeEnd), kind: b.kind });
    }
    day = day.plus({ days: 1 });
  }
  return out.sort((a, b) => a.start - b.start);
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** True when the union of `intervals` covers all of `target`. */
export function covers(intervals: Interval[], target: Interval): boolean {
  let cursor = target.start;
  const sorted = intervals.filter((i) => overlaps(i, target)).sort((a, b) => a.start - b.start);
  for (const i of sorted) {
    if (i.start > cursor) return false;
    cursor = Math.max(cursor, i.end);
    if (cursor >= target.end) return true;
  }
  return cursor >= target.end;
}

/** Merges touching or overlapping blocks of the same day and kind, and sorts them. */
export function normalizeBlocks(blocks: AvailabilityBlock[]): AvailabilityBlock[] {
  const byKey = new Map<string, AvailabilityBlock[]>();
  for (const b of blocks) {
    const key = `${b.day}:${b.kind}`;
    const list = byKey.get(key) ?? [];
    list.push({ ...b });
    byKey.set(key, list);
  }
  const out: AvailabilityBlock[] = [];
  for (const list of byKey.values()) {
    list.sort((a, b) => a.startMin - b.startMin);
    let cur = list[0]!;
    for (const b of list.slice(1)) {
      if (b.startMin <= cur.endMin) {
        cur.endMin = Math.max(cur.endMin, b.endMin);
      } else {
        out.push(cur);
        cur = b;
      }
    }
    out.push(cur);
  }
  return out.sort((a, b) => a.day - b.day || a.startMin - b.startMin || a.kind.localeCompare(b.kind));
}

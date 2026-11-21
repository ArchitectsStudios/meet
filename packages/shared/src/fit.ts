import { covers, expandWeekly, overlaps, type Interval } from "./time";
import type { AvailabilityBlock } from "./types";

/**
 * How well a meeting time suits one person:
 * - available: the whole meeting is inside their "ideal" time.
 * - tentative: they can make it, but not all of it is ideal (or they have not set availability).
 * - unavailable: it touches time they marked unavailable, or clashes with another meeting they are going to.
 */
export type Fit = "available" | "tentative" | "unavailable";

export interface FitResult {
  fit: Fit;
  /** Short explanation for a tooltip. */
  reason: string;
}

export function meetingFit(
  person: { blocks: AvailabilityBlock[]; timezone: string | null },
  meeting: Interval,
  /** The person's other meetings that they have not declined. */
  busy: Interval[] = [],
): FitResult {
  if (busy.some((b) => overlaps(b, meeting))) {
    return { fit: "unavailable", reason: "Has another meeting at this time" };
  }
  if (!person.timezone || person.blocks.length === 0) {
    return { fit: "tentative", reason: "Has not set their availability" };
  }
  const intervals = expandWeekly(person.blocks, person.timezone, meeting.start, meeting.end);
  if (intervals.some((i) => i.kind === "unavailable")) {
    return { fit: "unavailable", reason: "Marked this time as unavailable" };
  }
  if (covers(intervals.filter((i) => i.kind === "ideal"), meeting)) {
    return { fit: "available", reason: "This time is ideal for them" };
  }
  return { fit: "tentative", reason: "Free, but not their ideal time" };
}

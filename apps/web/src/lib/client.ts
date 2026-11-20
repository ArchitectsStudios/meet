import { DateTime } from "luxon";

export const SLOT_MIN = 30;
export const SLOTS_PER_DAY = (24 * 60) / SLOT_MIN;
export const ROW_H = 18; // px per 30-minute row
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issues = (body as { issues?: { message: string }[] }).issues;
    const msg = (body as { error?: string }).error ?? `Request failed (${res.status})`;
    throw new Error(issues?.length ? `${msg}: ${issues.map((i) => i.message).join(", ")}` : msg);
  }
  return body as T;
}

export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function allTimezones(): string[] {
  const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  return list.includes("UTC") ? list : ["UTC", ...list];
}

export function tzLabel(tz: string): string {
  const offset = DateTime.now().setZone(tz).toFormat("ZZ");
  return `${tz.replace(/_/g, " ")} (UTC${offset})`;
}

/** Monday 00:00 of the week containing `dt`, in the zone of `dt`. Luxon weeks start on Monday. */
export function weekStartOf(dt: DateTime): DateTime {
  return dt.startOf("week");
}

/** Splits [start, end) into per-day pieces in `tz`, relative to `weekStart`. */
export function dayPieces(
  start: number,
  end: number,
  tz: string,
  weekStart: DateTime,
): { day: number; startMin: number; endMin: number }[] {
  const out: { day: number; startMin: number; endMin: number }[] = [];
  let cur = DateTime.fromMillis(start, { zone: tz });
  const stop = DateTime.fromMillis(end, { zone: tz });
  while (cur < stop) {
    const dayStart = cur.startOf("day");
    const nextDay = dayStart.plus({ days: 1 });
    const pieceEnd = stop < nextDay ? stop : nextDay;
    const day = Math.round(dayStart.diff(weekStart.startOf("day"), "days").days);
    if (day >= 0 && day < 7) {
      out.push({
        day,
        startMin: cur.hour * 60 + cur.minute,
        endMin: pieceEnd.equals(nextDay) ? 1440 : pieceEnd.hour * 60 + pieceEnd.minute,
      });
    }
    cur = pieceEnd;
  }
  return out;
}

export function formatRange(start: string | number, end: string | number, tz: string): string {
  const s = typeof start === "number" ? DateTime.fromMillis(start, { zone: tz }) : DateTime.fromISO(start, { zone: tz });
  const e = typeof end === "number" ? DateTime.fromMillis(end, { zone: tz }) : DateTime.fromISO(end, { zone: tz });
  const sameDay = s.hasSame(e, "day");
  return sameDay
    ? `${s.toFormat("ccc d LLL, HH:mm")} – ${e.toFormat("HH:mm")}`
    : `${s.toFormat("ccc d LLL, HH:mm")} – ${e.toFormat("ccc d LLL, HH:mm")}`;
}

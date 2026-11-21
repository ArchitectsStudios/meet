"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import { expandWeekly, type AvailabilityBlock } from "@meet/shared";
import type { MeetingJson } from "@/lib/meetings";
import { api, dayPieces, ROW_H, SLOT_MIN, SLOTS_PER_DAY, weekStartOf } from "@/lib/client";
import { TimeGrid } from "./TimeGrid";

interface Props {
  /** Only meetings in this server are shown. */
  guildId: string;
  timezone: string;
  meId: string;
  blocks: AvailabilityBlock[];
}

function chipClass(m: MeetingJson, meId: string): string {
  if (m.organizerId === meId) return "bg-accent/85 border-accent text-white";
  const rsvp = m.guests.find((g) => g.discordId === meId)?.rsvp;
  switch (rsvp) {
    case "accepted":
      return "bg-ideal/85 border-ideal text-white";
    case "maybe":
      return "bg-warn/30 border-warn text-yellow-100";
    case "declined":
      return "bg-panel-2/80 border-line text-muted line-through";
    default:
      return "bg-panel-2/90 border-accent border-dashed text-text";
  }
}

export function WeekCalendar({ guildId, timezone, meId, blocks }: Props) {
  const [weekStart, setWeekStart] = useState(() => weekStartOf(DateTime.now().setZone(timezone)));
  const [meetings, setMeetings] = useState<MeetingJson[]>([]);
  const [error, setError] = useState<string | null>(null);
  const weekEnd = weekStart.plus({ weeks: 1 });

  useEffect(() => {
    let alive = true;
    const qs = new URLSearchParams({ guild: guildId, from: weekStart.toUTC().toISO()!, to: weekEnd.toUTC().toISO()! });
    api<MeetingJson[]>(`/api/meetings?${qs}`)
      .then((list) => alive && (setMeetings(list), setError(null)))
      .catch((err) => alive && setError((err as Error).message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart.toMillis(), guildId]);

  // Shade the grid with this week's availability, resolved per date so DST is handled.
  const shading = useMemo(() => {
    const cells = new Map<number, "unavailable" | "ideal">();
    for (const i of expandWeekly(blocks, timezone, weekStart.toMillis(), weekEnd.toMillis())) {
      for (const p of dayPieces(i.start, i.end, timezone, weekStart)) {
        for (let s = Math.floor(p.startMin / SLOT_MIN); s < Math.ceil(p.endMin / SLOT_MIN); s++) {
          const key = p.day * SLOTS_PER_DAY + s;
          if (i.kind === "unavailable" || !cells.has(key)) cells.set(key, i.kind);
        }
      }
    }
    return cells;
  }, [blocks, timezone, weekStart, weekEnd]);

  const days = Array.from({ length: 7 }, (_, i) => weekStart.plus({ days: i }));
  const today = DateTime.now().setZone(timezone).startOf("day");

  const pieces = useMemo(
    () =>
      meetings.flatMap((m) =>
        dayPieces(Date.parse(m.start), Date.parse(m.end), timezone, weekStart).map((p) => ({ ...p, m })),
      ),
    [meetings, timezone, weekStart],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-ghost" onClick={() => setWeekStart(weekStartOf(DateTime.now().setZone(timezone)))}>
          Today
        </button>
        <button className="btn-ghost" aria-label="Previous week" onClick={() => setWeekStart(weekStart.minus({ weeks: 1 }))}>
          ‹
        </button>
        <button className="btn-ghost" aria-label="Next week" onClick={() => setWeekStart(weekStart.plus({ weeks: 1 }))}>
          ›
        </button>
        <h1 className="ml-1 text-base font-semibold sm:ml-2 sm:text-lg">
          {weekStart.toFormat("d LLL")} – {weekEnd.minus({ days: 1 }).toFormat("d LLL yyyy")}
        </h1>
        <span className="ml-auto hidden text-xs text-muted sm:inline">{timezone.replace(/_/g, " ")}</span>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-ideal/25" /> Ideal</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-unavail/25" /> Unavailable</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-accent" /> Organizing</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-ideal" /> Going</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm border border-dashed border-accent" /> Not answered</span>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <TimeGrid
        headers={days.map((d) => (
          <span className={d.equals(today) ? "text-accent" : ""}>
            {d.toFormat("ccc")} <span className="text-muted">{d.toFormat("d")}</span>
          </span>
        ))}
        cellClass={(day, slot) => {
          const k = shading.get(day * SLOTS_PER_DAY + slot);
          return k === "ideal" ? "bg-ideal/15" : k === "unavailable" ? "bg-unavail/15" : "";
        }}
        renderOverlay={(day) =>
          pieces
            .filter((p) => p.day === day)
            .map((p) => (
              <Link
                key={`${p.m._id}-${p.startMin}`}
                href={`/meetings/${p.m._id}`}
                className={`pointer-events-auto absolute right-0.5 left-0.5 overflow-hidden rounded border px-1 py-0.5 text-[11px] leading-tight hover:brightness-110 ${chipClass(p.m, meId)}`}
                style={{
                  top: (p.startMin / SLOT_MIN) * ROW_H,
                  height: Math.max(((p.endMin - p.startMin) / SLOT_MIN) * ROW_H - 1, ROW_H - 1),
                }}
                title={p.m.title}
              >
                <div className="font-medium">{p.m.title}</div>
                <div className="opacity-80">
                  {DateTime.fromISO(p.m.start, { zone: timezone }).toFormat("HH:mm")}
                  {p.m.voiceChannelId ? " · voice" : ""}
                </div>
              </Link>
            ))
        }
      />
    </div>
  );
}

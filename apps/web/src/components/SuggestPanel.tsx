"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import { api, dayPieces, formatRange, SLOT_MIN, SLOTS_PER_DAY, weekStartOf } from "@/lib/client";
import { TimeGrid } from "./TimeGrid";
import type { PickedRole, PickedUser } from "./GuestPicker";

const ROW = 18;

interface Slot {
  start: number;
  end: number;
  score: number;
  requiredIdeal: number;
  optionalIdeal: number;
  optionalUnavailable: number;
  unavailable: string[];
}

interface SuggestResponse {
  slots: Slot[];
  heatmap: { start: number; score: number | null; unavailable: number }[];
  participantCount: number;
  requiredCount: number;
  withoutAvailability: string[];
}

interface Props {
  guildId: string;
  timezone: string;
  users: PickedUser[];
  roles: PickedRole[];
  durationMin: number;
  /** Date (yyyy-MM-dd) currently in the form; picks which week to search. */
  date: string;
  /** The time currently chosen in the form, outlined on the grid. */
  selected: { start: number; end: number } | null;
  excludeMeetingId?: string;
  /** A click passes only the start; a drag passes the start and end. */
  onPick: (startMillis: number, endMillis?: number) => void;
}

type Drag = { day: number; s0: number; s1: number };

const hhmm = (slot: number) => {
  const min = slot * SLOT_MIN;
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
};

export function SuggestPanel({ guildId, timezone, users, roles, durationMin, date, selected, excludeMeetingId, onPick }: Props) {
  const [weekStart, setWeekStart] = useState(() =>
    weekStartOf(DateTime.fromISO(date, { zone: timezone }).isValid ? DateTime.fromISO(date, { zone: timezone }) : DateTime.now().setZone(timezone)),
  );
  const [data, setData] = useState<SuggestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const load = async (ws = weekStart) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<SuggestResponse>("/api/suggest", {
        method: "POST",
        body: JSON.stringify({
          guildId,
          users: users.map((u) => ({ discordId: u.discordId, required: u.required })),
          roles: roles.map((r) => ({ roleId: r.roleId, required: r.required })),
          durationMin,
          rangeStart: ws.toUTC().toISO(),
          rangeEnd: ws.plus({ weeks: 1 }).toUTC().toISO(),
          excludeMeetingId,
        }),
      });
      setData(res);
    } catch (err) {
      setError((err as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const shift = (weeks: number) => {
    const ws = weekStart.plus({ weeks });
    setWeekStart(ws);
    void load(ws);
  };

  // Map heatmap starts to grid cells for display in the viewer's timezone.
  const cellScores = new Map<number, number | null>();
  let maxScore = 0;
  for (const h of data?.heatmap ?? []) {
    const [p] = dayPieces(h.start, h.start + SLOT_MIN * 60_000, timezone, weekStart);
    if (!p) continue;
    cellScores.set(p.day * SLOTS_PER_DAY + Math.floor(p.startMin / SLOT_MIN), h.score);
    if (h.score !== null) maxScore = Math.max(maxScore, h.score);
  }
  const heat = (score: number | null | undefined) => {
    if (score === undefined) return "bg-bg/60"; // past or outside range
    if (score === null) return "bg-unavail/25";
    if (maxScore <= 0) return score < 0 ? "bg-warn/20" : "bg-ideal/10";
    const r = score / maxScore;
    return r >= 0.75 ? "bg-ideal/70" : r >= 0.5 ? "bg-ideal/45" : r > 0 ? "bg-ideal/25" : score < 0 ? "bg-warn/20" : "bg-ideal/10";
  };

  const slotMillis = (day: number, slot: number) =>
    weekStart.plus({ days: day }).set({ hour: Math.floor(slot / 2), minute: (slot % 2) * 30 }).toMillis();

  const cellAt = (x: number, y: number): { day: number; slot: number } | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const d = el?.dataset.day;
    const s = el?.dataset.slot;
    return d !== undefined && s !== undefined ? { day: Number(d), slot: Number(s) } : null;
  };

  // Releasing the pointer: a plain click sets only the start (the length stays), a drag sets start and end.
  const finish = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    setDrag(null);
    const lo = Math.min(d.s0, d.s1);
    const hi = Math.max(d.s0, d.s1);
    if (lo === hi) onPick(slotMillis(d.day, lo));
    else onPick(slotMillis(d.day, lo), slotMillis(d.day, hi + 1));
    // slotMillis depends on weekStart only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPick, weekStart]);

  useEffect(() => {
    const up = () => finish();
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [finish]);

  const chosen = selected ? dayPieces(selected.start, selected.end, timezone, weekStart) : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" disabled={loading} onClick={() => load()}>
          {loading ? "Finding times…" : data ? "Refresh" : "Find best times"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => shift(-1)} aria-label="Previous week">
          ‹
        </button>
        <span className="text-sm">
          Week of {weekStart.toFormat("d LLL")}
        </span>
        <button type="button" className="btn-ghost" onClick={() => shift(1)} aria-label="Next week">
          ›
        </button>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {data && (
        <>
          <p className="text-xs text-muted">
            Checked {data.participantCount} people ({data.requiredCount} required, including you).
            {data.withoutAvailability.length > 0 &&
              ` ${data.withoutAvailability.length} have not set availability, so they count as free.`}
          </p>
          {data.slots.length === 0 ? (
            <p className="text-sm text-warn">No time this week works for every required guest.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.slots.map((s) => (
                <button
                  key={s.start}
                  type="button"
                  className="btn-ghost flex-col items-start text-left"
                  onClick={() => onPick(s.start)}
                >
                  <span>{formatRange(s.start, s.end, timezone)}</span>
                  <span className="text-[11px] text-muted">
                    {s.requiredIdeal} required ideal · {s.optionalIdeal} optional ideal
                    {s.optionalUnavailable ? ` · ${s.optionalUnavailable} optional can't` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
          <TimeGrid
            headers={Array.from({ length: 7 }, (_, i) => weekStart.plus({ days: i }).toFormat("ccc d"))}
            maxHeight="45vh"
            scrollToHour={8}
            rowHeight={ROW}
            cellClass={(day, slot) => `${heat(cellScores.get(day * SLOTS_PER_DAY + slot))} cursor-crosshair hover:brightness-150`}
            cellProps={(day, slot) => ({ "data-day": String(day), "data-slot": String(slot) })}
            renderOverlay={(day) => (
              <>
                {chosen
                  .filter((p) => p.day === day && !drag)
                  .map((p) => (
                    <div
                      key={p.startMin}
                      className="absolute right-0.5 left-0.5 rounded-md border-2 border-accent bg-accent/15"
                      style={{ top: (p.startMin / SLOT_MIN) * ROW, height: ((p.endMin - p.startMin) / SLOT_MIN) * ROW }}
                    />
                  ))}
                {drag?.day === day && (
                  <div
                    className="absolute right-0.5 left-0.5 flex items-start justify-center overflow-hidden rounded-md border-2 border-dashed border-accent bg-accent/25 pt-0.5"
                    style={{
                      top: Math.min(drag.s0, drag.s1) * ROW,
                      height: (Math.abs(drag.s1 - drag.s0) + 1) * ROW,
                    }}
                  >
                    <span className="rounded bg-bg/80 px-1 text-[10px] font-medium text-text tabular-nums">
                      {hhmm(Math.min(drag.s0, drag.s1))}–{hhmm(Math.max(drag.s0, drag.s1) + 1)}
                    </span>
                  </div>
                )}
              </>
            )}
            containerProps={{
              style: { touchAction: "none" },
              onPointerDown: (e) => {
                const c = cellAt(e.clientX, e.clientY);
                if (!c || cellScores.get(c.day * SLOTS_PER_DAY + c.slot) === undefined) return;
                e.preventDefault();
                setDrag({ day: c.day, s0: c.slot, s1: c.slot });
              },
              onPointerMove: (e) => {
                const d = dragRef.current;
                if (!d) return;
                const c = cellAt(e.clientX, e.clientY);
                // A meeting stays within the day the drag started on.
                if (c && c.slot !== d.s1) setDrag({ ...d, s1: c.slot });
              },
            }}
          />
          <p className="text-xs text-muted">
            Click a cell to start then, or drag down a day to set the start and end. Darker green = more people ideally
            free. Red = a required guest can&apos;t make it.
          </p>
        </>
      )}
    </div>
  );
}

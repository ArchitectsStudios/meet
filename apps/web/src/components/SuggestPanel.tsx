"use client";

import { useState } from "react";
import { DateTime } from "luxon";
import { api, dayPieces, formatRange, SLOT_MIN, SLOTS_PER_DAY, weekStartOf } from "@/lib/client";
import { TimeGrid } from "./TimeGrid";
import type { PickedRole, PickedUser } from "./GuestPicker";

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
  timezone: string;
  users: PickedUser[];
  roles: PickedRole[];
  durationMin: number;
  /** Date (yyyy-MM-dd) currently in the form; picks which week to search. */
  date: string;
  excludeMeetingId?: string;
  onPick: (startMillis: number) => void;
}

export function SuggestPanel({ timezone, users, roles, durationMin, date, excludeMeetingId, onPick }: Props) {
  const [weekStart, setWeekStart] = useState(() =>
    weekStartOf(DateTime.fromISO(date, { zone: timezone }).isValid ? DateTime.fromISO(date, { zone: timezone }) : DateTime.now().setZone(timezone)),
  );
  const [data, setData] = useState<SuggestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (ws = weekStart) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<SuggestResponse>("/api/suggest", {
        method: "POST",
        body: JSON.stringify({
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
            cellClass={(day, slot) => `${heat(cellScores.get(day * SLOTS_PER_DAY + slot))} cursor-pointer hover:outline hover:outline-accent`}
            cellProps={(day, slot) => ({
              onClick: () => {
                if (cellScores.get(day * SLOTS_PER_DAY + slot) === undefined) return;
                onPick(weekStart.plus({ days: day }).set({ hour: Math.floor(slot / 2), minute: (slot % 2) * 30 }).toMillis());
              },
              title: "Click to use this start time",
            })}
          />
          <p className="text-xs text-muted">
            Each cell is a possible start time. Darker green = more people ideally free. Red = a required guest can&apos;t make
            it.
          </p>
        </>
      )}
    </div>
  );
}

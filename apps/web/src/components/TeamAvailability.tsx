"use client";

import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { expandWeekly, type AvailabilityBlock } from "@meet/shared";
import { dayPieces, SLOT_MIN, SLOTS_PER_DAY, weekStartOf } from "@/lib/client";
import { TimeGrid } from "./TimeGrid";

export interface TeamMember {
  discordId: string;
  displayName: string;
  avatarUrl: string;
  timezone: string | null;
  blocks: AvailabilityBlock[];
}

type State = "ideal" | "unavailable" | "tentative" | "unknown";
const CELLS = 7 * SLOTS_PER_DAY;

/** Each member's state for every half hour of the week, in the viewer's timezone. */
function memberCells(m: TeamMember, weekStart: DateTime, viewerTz: string): State[] {
  if (!m.timezone || m.blocks.length === 0) return new Array<State>(CELLS).fill("unknown");
  const cells = new Array<State>(CELLS).fill("tentative");
  const from = weekStart.toMillis();
  const to = weekStart.plus({ weeks: 1 }).toMillis();
  const intervals = expandWeekly(m.blocks, m.timezone, from, to);
  // Ideal first, so unavailable wins where they touch.
  for (const kind of ["ideal", "unavailable"] as const) {
    for (const iv of intervals.filter((i) => i.kind === kind)) {
      for (const p of dayPieces(iv.start, iv.end, viewerTz, weekStart)) {
        // Unavailable marks any half hour it touches; ideal needs the whole half hour.
        const first = kind === "unavailable" ? Math.floor(p.startMin / SLOT_MIN) : Math.ceil(p.startMin / SLOT_MIN);
        const last = kind === "unavailable" ? Math.ceil(p.endMin / SLOT_MIN) : Math.floor(p.endMin / SLOT_MIN);
        for (let s = first; s < last; s++) cells[p.day * SLOTS_PER_DAY + s] = kind;
      }
    }
  }
  return cells;
}

const LABEL: Record<State, string> = {
  ideal: "Ideal",
  unavailable: "Unavailable",
  tentative: "Tentative",
  unknown: "Availability Unknown",
};
const DOT: Record<State, string> = {
  ideal: "bg-ideal",
  unavailable: "bg-unavail",
  tentative: "bg-warn",
  unknown: "bg-line",
};

export function TeamAvailability({ members, timezone, meId }: { members: TeamMember[]; timezone: string; meId: string }) {
  const [weekStart, setWeekStart] = useState(() => weekStartOf(DateTime.now().setZone(timezone)));
  const [on, setOn] = useState<Set<string>>(() => new Set(members.map((m) => m.discordId)));
  const [hover, setHover] = useState<{ day: number; slot: number } | null>(null);
  const [showList, setShowList] = useState(false);

  const cellsById = useMemo(
    () => new Map(members.map((m) => [m.discordId, memberCells(m, weekStart, timezone)])),
    [members, weekStart, timezone],
  );
  const selected = members.filter((m) => on.has(m.discordId));
  const known = selected.filter((m) => cellsById.get(m.discordId)![0] !== "unknown");

  const tally = (idx: number) => {
    let ideal = 0;
    let unavailable = 0;
    for (const m of known) {
      const s = cellsById.get(m.discordId)![idx];
      if (s === "ideal") ideal++;
      else if (s === "unavailable") unavailable++;
    }
    return { ideal, unavailable };
  };

  // Red when anyone selected is unavailable, deeper the more people; otherwise green by how many find it ideal.
  const cellStyle = (idx: number): React.CSSProperties => {
    if (known.length === 0) return {};
    const { ideal, unavailable } = tally(idx);
    if (unavailable > 0) {
      const pct = Math.round(18 + 50 * (unavailable / known.length));
      return { backgroundColor: `color-mix(in srgb, var(--color-unavail) ${pct}%, transparent)` };
    }
    if (ideal === 0) return {};
    const pct = Math.round(12 + 63 * (ideal / known.length));
    return { backgroundColor: `color-mix(in srgb, var(--color-ideal) ${pct}%, transparent)` };
  };

  const toggle = (id: string) =>
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const hoverIdx = hover ? hover.day * SLOTS_PER_DAY + hover.slot : null;
  const hoverGroups =
    hoverIdx === null
      ? null
      : (["ideal", "tentative", "unavailable", "unknown"] as const).map((state) => ({
          state,
          names: selected.filter((m) => cellsById.get(m.discordId)![hoverIdx] === state).map((m) => m.displayName),
        }));
  const hoverTime =
    hover &&
    weekStart
      .plus({ days: hover.day, minutes: hover.slot * SLOT_MIN })
      .toFormat("cccc HH:mm") + `–${weekStart.plus({ days: hover.day, minutes: (hover.slot + 1) * SLOT_MIN }).toFormat("HH:mm")}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="card h-fit space-y-3 p-4 lg:sticky lg:top-20">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="text-sm font-semibold lg:pointer-events-none"
            onClick={() => setShowList((s) => !s)}
            aria-expanded={showList}
          >
            Members{" "}
            <span className="font-normal text-muted">
              {selected.length}/{members.length}
            </span>
            <span className="ml-1 text-muted lg:hidden">{showList ? "▴" : "▾"}</span>
          </button>
          <div className="flex gap-1 text-xs">
            <button type="button" className="rounded px-1.5 py-0.5 text-muted hover:bg-panel-2 hover:text-text" onClick={() => setOn(new Set(members.map((m) => m.discordId)))}>
              All
            </button>
            <button type="button" className="rounded px-1.5 py-0.5 text-muted hover:bg-panel-2 hover:text-text" onClick={() => setOn(new Set())}>
              None
            </button>
          </div>
        </div>
        <ul className={`max-h-[60vh] space-y-0.5 overflow-y-auto ${showList ? "" : "hidden"} lg:block`}>
          {members.map((m) => {
            const checked = on.has(m.discordId);
            const unknown = cellsById.get(m.discordId)![0] === "unknown";
            return (
              <li key={m.discordId}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-panel-2">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" checked={checked} onChange={() => toggle(m.discordId)} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.avatarUrl} alt="" className="h-6 w-6 rounded-full" />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className={`truncate ${checked ? "" : "text-muted"}`}>
                      {m.displayName}
                      {m.discordId === meId && <span className="text-muted"> (you)</span>}
                    </span>
                    {m.timezone && (
                      <span className="truncate text-[11px] text-muted" title={m.timezone} suppressHydrationWarning>
                        {m.timezone.replace(/_/g, " ")} · {DateTime.now().setZone(m.timezone).toFormat("HH:mm")}
                      </span>
                    )}
                  </span>
                  {unknown && (
                    <span className="ml-auto shrink-0 text-[10px] text-muted" title="Has not set availability for this server">
                      unknown
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost" onClick={() => setWeekStart(weekStart.minus({ weeks: 1 }))} aria-label="Previous week">
            ‹
          </button>
          <span className="text-sm">Week of {weekStart.toFormat("d LLL")}</span>
          <button type="button" className="btn-ghost" onClick={() => setWeekStart(weekStart.plus({ weeks: 1 }))} aria-label="Next week">
            ›
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm bg-ideal/75" /> More people ideal
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm bg-unavail/60" /> Someone unavailable
            </span>
          </div>
        </div>

        <TimeGrid
          headers={Array.from({ length: 7 }, (_, i) => weekStart.plus({ days: i }).toFormat("ccc d"))}
          scrollToHour={8}
          cellProps={(day, slot) => ({
            style: cellStyle(day * SLOTS_PER_DAY + slot),
            onPointerEnter: () => setHover({ day, slot }),
            onClick: () => setHover({ day, slot }),
          })}
          cellClass={(day, slot) => (hover?.day === day && hover.slot === slot ? "outline outline-1 outline-accent" : "")}
          containerProps={{ onPointerLeave: (e) => e.pointerType === "mouse" && setHover(null) }}
        />

        <div className="card min-h-24 p-4 text-sm">
          {hoverGroups ? (
            <div className="space-y-1.5">
              <p className="font-medium">{hoverTime}</p>
              {hoverGroups
                .filter((g) => g.names.length > 0)
                .map((g) => (
                  <p key={g.state} className="flex gap-2">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[g.state]}`} />
                    <span>
                      <span className="text-muted">{LABEL[g.state]}:</span> {g.names.join(", ")}
                    </span>
                  </p>
                ))}
            </div>
          ) : (
            <p className="text-muted">
              Hover over or tap a time to see who is ideal, tentative or unavailable. Times are in your timezone.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

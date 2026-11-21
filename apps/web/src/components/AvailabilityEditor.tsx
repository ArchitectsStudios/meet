"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { AvailabilityBlock, Weekday } from "@meet/shared";
import { SLOT_MIN, SLOTS_PER_DAY, WEEKDAYS } from "@/lib/client";
import { TimeGrid } from "./TimeGrid";

type Cell = 0 | 1 | 2; // 0 = unmarked, 1 = unavailable, 2 = ideal
type Brush = Cell;

const ROW = 20; // px per 30-minute row in the editor

/** Visual style for each painted kind, shared by the grid blocks and the toolbar swatches. */
const KIND: Record<1 | 2, { label: string; box: string; text: string; style?: CSSProperties; outline: string }> = {
  1: {
    label: "Unavailable",
    box: "border border-unavail/50 border-l-[3px] border-l-unavail",
    text: "text-unavail-soft",
    style: {
      // Opaque base so the grid lines do not show through, with a hatch so it reads as "blocked".
      backgroundColor: "color-mix(in srgb, var(--color-unavail) 14%, var(--color-panel))",
      backgroundImage:
        "repeating-linear-gradient(135deg, rgb(194 65 75 / 0.22) 0 5px, transparent 5px 10px)",
    },
    outline: "border-unavail",
  },
  2: {
    label: "Ideal",
    box: "border border-ideal/50 border-l-[3px] border-l-ideal",
    style: { backgroundColor: "color-mix(in srgb, var(--color-ideal) 24%, var(--color-panel))" },
    text: "text-ideal-soft",
    outline: "border-ideal",
  },
};

const BRUSHES: { value: Brush; label: string; hint: string }[] = [
  { value: 1, label: "Unavailable", hint: "Times you can never meet" },
  { value: 2, label: "Ideal", hint: "Times that suit you best" },
  { value: 0, label: "Erase", hint: "Back to unmarked: available, but not ideal" },
];

function blocksToCells(blocks: AvailabilityBlock[]): Cell[] {
  const cells: Cell[] = new Array(7 * SLOTS_PER_DAY).fill(0);
  for (const b of blocks) {
    const from = Math.floor(b.startMin / SLOT_MIN);
    const to = Math.ceil(b.endMin / SLOT_MIN);
    for (let s = from; s < to; s++) {
      const idx = b.day * SLOTS_PER_DAY + s;
      // Unavailable wins when both kinds touch a cell.
      if (b.kind === "unavailable") cells[idx] = 1;
      else if (cells[idx] !== 1) cells[idx] = 2;
    }
  }
  return cells;
}

/** Runs of identical non-empty cells in one day, as [startSlot, endSlot) ranges. */
function dayRuns(cells: Cell[], day: number): { start: number; end: number; kind: 1 | 2 }[] {
  const runs: { start: number; end: number; kind: 1 | 2 }[] = [];
  let s = 0;
  while (s < SLOTS_PER_DAY) {
    const v = cells[day * SLOTS_PER_DAY + s]!;
    if (v === 0) {
      s++;
      continue;
    }
    let e = s;
    while (e < SLOTS_PER_DAY && cells[day * SLOTS_PER_DAY + e] === v) e++;
    runs.push({ start: s, end: e, kind: v });
    s = e;
  }
  return runs;
}

function cellsToBlocks(cells: Cell[]): AvailabilityBlock[] {
  const out: AvailabilityBlock[] = [];
  for (let day = 0; day < 7; day++) {
    for (const r of dayRuns(cells, day)) {
      out.push({
        day: day as Weekday,
        startMin: r.start * SLOT_MIN,
        endMin: r.end * SLOT_MIN,
        kind: r.kind === 1 ? "unavailable" : "ideal",
      });
    }
  }
  return out;
}

const hhmm = (slot: number) => {
  const min = slot * SLOT_MIN;
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
};

const hours = (slots: number) => {
  const h = (slots * SLOT_MIN) / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
};

interface Props {
  initialBlocks: AvailabilityBlock[];
  onSave: (blocks: AvailabilityBlock[]) => Promise<void>;
  saveLabel?: string;
}

type Drag = { d0: number; s0: number; d1: number; s1: number };

function dragBounds(d: Drag) {
  return {
    dl: Math.min(d.d0, d.d1),
    dh: Math.max(d.d0, d.d1),
    sl: Math.min(d.s0, d.s1),
    sh: Math.max(d.s0, d.s1),
  };
}

function applyDrag(cells: Cell[], d: Drag, brush: Brush): Cell[] {
  const { dl, dh, sl, sh } = dragBounds(d);
  const next = [...cells];
  for (let day = dl; day <= dh; day++) {
    for (let s = sl; s <= sh; s++) next[day * SLOTS_PER_DAY + s] = brush;
  }
  return next;
}

/**
 * Weekly availability painter. Drag across the grid to fill a rectangle with the chosen brush.
 * Works with mouse and touch (touch-action: none on the grid).
 */
export function AvailabilityEditor({ initialBlocks, onSave, saveLabel = "Save availability" }: Props) {
  const [cells, setCells] = useState<Cell[]>(() => blocksToCells(initialBlocks));
  const [brush, setBrush] = useState<Brush>(1);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const cellAt = (x: number, y: number): { day: number; slot: number } | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const d = el?.dataset.day;
    const s = el?.dataset.slot;
    return d !== undefined && s !== undefined ? { day: Number(d), slot: Number(s) } : null;
  };

  const commit = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    setCells((prev) => applyDrag(prev, d, brush));
    setDirty(true);
    setDrag(null);
  }, [brush]);

  useEffect(() => {
    const up = () => commit();
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [commit]);

  // While dragging, show the result live so the grid always looks like what will be saved.
  const shown = useMemo(() => (drag ? applyDrag(cells, drag, brush) : cells), [cells, drag, brush]);
  const blocks = useMemo(() => cellsToBlocks(cells), [cells]);
  const totals = useMemo(() => {
    let unavail = 0;
    let ideal = 0;
    for (const c of cells) {
      if (c === 1) unavail++;
      else if (c === 2) ideal++;
    }
    return { unavail, ideal };
  }, [cells]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await onSave(blocks);
      setDirty(false);
      setMessage("Saved");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const selection = drag ? dragBounds(drag) : null;

  return (
    <div className="space-y-3">
      <div className="max-w-3xl space-y-1.5 text-sm leading-relaxed text-muted">
        <p>
          Mark any times you&apos;d prefer to have meetings as <span className="font-medium text-ideal-soft">Ideal</span>, and
          the times when you are <span className="font-medium text-unavail-soft">Unavailable</span>.
        </p>
        <p>
          Anything not marked Ideal or Unavailable counts as <span className="font-medium text-text">tentative</span>: for
          example, you could stay up an hour later every so often to fit a meeting in, or move something else to make it
          work.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-line bg-panel-2 p-1" role="radiogroup" aria-label="Brush">
          {BRUSHES.map((b) => {
            const active = brush === b.value;
            return (
              <button
                key={b.value}
                type="button"
                role="radio"
                aria-checked={active}
                title={b.hint}
                onClick={() => setBrush(b.value)}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-bg text-text shadow-sm ring-1 ring-line" : "text-muted hover:text-text"
                }`}
              >
                {b.value === 0 ? (
                  <span className="h-3 w-3 rounded-[3px] border border-dashed border-muted" />
                ) : (
                  <span className={`h-3 w-3 rounded-[3px] ${KIND[b.value].box}`} style={KIND[b.value].style} />
                )}
                {b.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-md px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-panel-2 hover:text-text"
            onClick={() => {
              setCells(new Array(7 * SLOTS_PER_DAY).fill(0));
              setDirty(true);
            }}
          >
            Clear all
          </button>
        </div>
      </div>

      <TimeGrid
        headers={WEEKDAYS}
        rowHeight={ROW}
        columnClass={(day) => (day >= 5 ? "bg-panel-2/35" : "")}
        cellClass={() => "cursor-crosshair hover:bg-text/[0.04]"}
        cellProps={(day, slot) => ({ "data-day": String(day), "data-slot": String(slot) })}
        renderOverlay={(day) =>
          dayRuns(shown, day).map((r) => {
            const k = KIND[r.kind];
            const slots = r.end - r.start;
            return (
              <div
                key={`${r.start}-${r.kind}`}
                className={`absolute right-1 left-1 overflow-hidden rounded-md px-1.5 leading-tight ${k.box} ${k.text}`}
                style={{ ...k.style, top: r.start * ROW + 1, height: slots * ROW - 2 }}
              >
                {slots >= 2 ? (
                  <div className="pt-1">
                    <div className="truncate text-[11px] font-semibold">{k.label}</div>
                    <div className="truncate text-[10px] tabular-nums opacity-80">
                      {hhmm(r.start)}–{hhmm(r.end)}
                    </div>
                  </div>
                ) : (
                  <div className="truncate text-[10px] tabular-nums opacity-80" style={{ lineHeight: `${ROW - 2}px` }}>
                    {hhmm(r.start)}–{hhmm(r.end)}
                  </div>
                )}
              </div>
            );
          })
        }
        gridOverlay={
          selection && (
            <div
              className={`absolute rounded-md border-2 border-dashed ${brush === 0 ? "border-muted" : KIND[brush].outline}`}
              style={{
                left: `calc(${(selection.dl / 7) * 100}% + 2px)`,
                width: `calc(${((selection.dh - selection.dl + 1) / 7) * 100}% - 4px)`,
                top: selection.sl * ROW,
                height: (selection.sh - selection.sl + 1) * ROW,
              }}
            />
          )
        }
        containerProps={{
          style: { touchAction: "none" },
          onPointerDown: (e) => {
            const c = cellAt(e.clientX, e.clientY);
            if (!c) return;
            e.preventDefault();
            setDrag({ d0: c.day, s0: c.slot, d1: c.day, s1: c.slot });
          },
          onPointerMove: (e) => {
            if (!dragRef.current) return;
            const c = cellAt(e.clientX, e.clientY);
            if (c && (c.day !== dragRef.current.d1 || c.slot !== dragRef.current.s1)) {
              setDrag({ ...dragRef.current, d1: c.day, s1: c.slot });
            }
          },
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Drag to paint. Times are in your timezone and repeat every week.
        </p>
        <p className="text-xs text-muted tabular-nums">
          <span className="text-ideal-soft">{hours(totals.ideal)} ideal</span>
          {" · "}
          <span className="text-unavail-soft">{hours(totals.unavail)} unavailable</span>
          {" per week"}
        </p>
      </div>

      <div className="flex items-center gap-3 border-t border-line pt-3">
        <button type="button" className="btn-primary" disabled={saving} onClick={save}>
          {saving ? "Saving…" : saveLabel}
        </button>
        {dirty && !saving && <span className="text-xs text-warn">Unsaved changes</span>}
        {message && !dirty && <span className="text-xs text-muted">{message}</span>}
      </div>
    </div>
  );
}

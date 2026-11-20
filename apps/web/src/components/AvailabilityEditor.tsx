"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AvailabilityBlock, Weekday } from "@meet/shared";
import { SLOT_MIN, SLOTS_PER_DAY, WEEKDAYS } from "@/lib/client";
import { TimeGrid } from "./TimeGrid";

type Cell = 0 | 1 | 2; // 0 = unmarked, 1 = unavailable, 2 = ideal
type Brush = Cell;

const BRUSHES: { value: Brush; label: string; swatch: string; hint: string }[] = [
  { value: 1, label: "Unavailable", swatch: "bg-unavail", hint: "You can never meet then" },
  { value: 2, label: "Ideal", swatch: "bg-ideal", hint: "Best times for you" },
  { value: 0, label: "Erase", swatch: "bg-panel-2 border border-line", hint: "Unmarked = available, not ideal" },
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

function cellsToBlocks(cells: Cell[]): AvailabilityBlock[] {
  const out: AvailabilityBlock[] = [];
  for (let day = 0; day < 7; day++) {
    let s = 0;
    while (s < SLOTS_PER_DAY) {
      const v = cells[day * SLOTS_PER_DAY + s]!;
      if (v === 0) {
        s++;
        continue;
      }
      let e = s;
      while (e < SLOTS_PER_DAY && cells[day * SLOTS_PER_DAY + e] === v) e++;
      out.push({
        day: day as Weekday,
        startMin: s * SLOT_MIN,
        endMin: e * SLOT_MIN,
        kind: v === 1 ? "unavailable" : "ideal",
      });
      s = e;
    }
  }
  return out;
}

interface Props {
  initialBlocks: AvailabilityBlock[];
  onSave: (blocks: AvailabilityBlock[]) => Promise<void>;
  saveLabel?: string;
}

/**
 * Weekly availability painter. Drag across the grid to fill a rectangle with the chosen brush.
 * Works with mouse and touch (touch-action: none on the grid).
 */
export function AvailabilityEditor({ initialBlocks, onSave, saveLabel = "Save availability" }: Props) {
  const [cells, setCells] = useState<Cell[]>(() => blocksToCells(initialBlocks));
  const [brush, setBrush] = useState<Brush>(1);
  const [drag, setDrag] = useState<{ d0: number; s0: number; d1: number; s1: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  const inDrag = useCallback(
    (day: number, slot: number) => {
      if (!drag) return false;
      const [dl, dh] = [Math.min(drag.d0, drag.d1), Math.max(drag.d0, drag.d1)];
      const [sl, sh] = [Math.min(drag.s0, drag.s1), Math.max(drag.s0, drag.s1)];
      return day >= dl && day <= dh && slot >= sl && slot <= sh;
    },
    [drag],
  );

  const cellAt = (x: number, y: number): { day: number; slot: number } | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const d = el?.dataset.day;
    const s = el?.dataset.slot;
    return d !== undefined && s !== undefined ? { day: Number(d), slot: Number(s) } : null;
  };

  const commit = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    setCells((prev) => {
      const next = [...prev];
      for (let day = Math.min(d.d0, d.d1); day <= Math.max(d.d0, d.d1); day++) {
        for (let s = Math.min(d.s0, d.s1); s <= Math.max(d.s0, d.s1); s++) next[day * SLOTS_PER_DAY + s] = brush;
      }
      return next;
    });
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

  const copyMondayToWeekdays = () => {
    setCells((prev) => {
      const next = [...prev];
      for (let day = 1; day < 5; day++) {
        for (let s = 0; s < SLOTS_PER_DAY; s++) next[day * SLOTS_PER_DAY + s] = prev[s]!;
      }
      return next;
    });
    setDirty(true);
  };

  const blocks = useMemo(() => cellsToBlocks(cells), [cells]);

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

  const colour = (v: Cell) => (v === 1 ? "bg-unavail/70" : v === 2 ? "bg-ideal/70" : "");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {BRUSHES.map((b) => (
          <button
            key={b.value}
            type="button"
            title={b.hint}
            onClick={() => setBrush(b.value)}
            className={`btn ${brush === b.value ? "bg-line ring-2 ring-accent" : "bg-panel-2 hover:bg-line"}`}
          >
            <span className={`h-3 w-3 rounded-sm ${b.swatch}`} />
            {b.label}
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-line" />
        <button type="button" className="btn-ghost" onClick={copyMondayToWeekdays}>
          Copy Monday to Tue–Fri
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setCells(new Array(7 * SLOTS_PER_DAY).fill(0));
            setDirty(true);
          }}
        >
          Clear all
        </button>
      </div>
      <p className="text-xs text-muted">
        Drag across the grid to paint. Times are in your timezone and repeat every week. Unmarked time counts as available but
        not ideal.
      </p>
      <TimeGrid
        headers={WEEKDAYS}
        cellClass={(day, slot) => {
          if (inDrag(day, slot)) return brush === 0 ? "bg-line" : brush === 1 ? "bg-unavail/40" : "bg-ideal/40";
          return `${colour(cells[day * SLOTS_PER_DAY + slot]!)} cursor-crosshair`;
        }}
        cellProps={(day, slot) => ({ "data-day": String(day), "data-slot": String(slot) })}
        containerProps={{
          style: { gridTemplateColumns: "3.5rem repeat(7, minmax(0, 1fr))", touchAction: "none" },
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
      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary" disabled={saving} onClick={save}>
          {saving ? "Saving…" : saveLabel}
        </button>
        {dirty && !saving && <span className="text-xs text-warn">Unsaved changes</span>}
        {message && !dirty && <span className="text-xs text-muted">{message}</span>}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";
import { ROW_H, SLOTS_PER_DAY } from "@/lib/client";

interface TimeGridProps {
  headers: ReactNode[];
  /** Background class for one 30-minute cell. */
  cellClass?: (day: number, slot: number) => string;
  /** Extra attributes for one cell, for example data attributes used by painting. */
  cellProps?: (day: number, slot: number) => HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string>;
  /** Absolutely positioned content for a day column (meeting blocks). */
  renderOverlay?: (day: number) => ReactNode;
  containerProps?: HTMLAttributes<HTMLDivElement>;
  /** Scroll so this hour is at the top on first render. */
  scrollToHour?: number;
  maxHeight?: string;
}

/** A 7-column grid with 48 half-hour rows and hour labels. Used by the calendar, editor, and heatmap. */
export function TimeGrid({
  headers,
  cellClass,
  cellProps,
  renderOverlay,
  containerProps,
  scrollToHour = 7,
  maxHeight = "70vh",
}: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollToHour * 2 * ROW_H;
  }, [scrollToHour]);

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-panel">
      <div className="grid border-b border-line" style={{ gridTemplateColumns: "3.5rem repeat(7, minmax(0, 1fr))" }}>
        <div />
        {headers.map((h, i) => (
          <div key={i} className="border-l border-line px-1 py-2 text-center text-xs font-medium">
            {h}
          </div>
        ))}
      </div>
      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight }}>
        <div
          className="relative grid select-none"
          style={{ gridTemplateColumns: "3.5rem repeat(7, minmax(0, 1fr))" }}
          {...containerProps}
        >
          <div>
            {Array.from({ length: SLOTS_PER_DAY }, (_, slot) => (
              <div key={slot} className="relative pr-1 text-right text-[10px] text-muted" style={{ height: ROW_H }}>
                {slot % 2 === 0 && <span className="relative -top-1.5">{String(slot / 2).padStart(2, "0")}:00</span>}
              </div>
            ))}
          </div>
          {headers.map((_, day) => (
            <div key={day} className="relative border-l border-line">
              {Array.from({ length: SLOTS_PER_DAY }, (_, slot) => (
                <div
                  key={slot}
                  className={`${slot % 2 === 0 ? "border-t border-line/70" : "border-t border-line/25"} ${cellClass?.(day, slot) ?? ""}`}
                  style={{ height: ROW_H }}
                  {...cellProps?.(day, slot)}
                />
              ))}
              {renderOverlay && <div className="pointer-events-none absolute inset-0">{renderOverlay(day)}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

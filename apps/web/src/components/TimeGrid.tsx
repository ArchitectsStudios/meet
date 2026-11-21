"use client";

import { useEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { ROW_H, SLOTS_PER_DAY } from "@/lib/client";

const GUTTER = "3.25rem";
const COLUMNS = `${GUTTER} repeat(7, minmax(0, 1fr))`;

interface TimeGridProps {
  headers: ReactNode[];
  /** Background class for one 30-minute cell. */
  cellClass?: (day: number, slot: number) => string;
  /** Extra attributes for one cell, for example data attributes used by painting. */
  cellProps?: (day: number, slot: number) => HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string>;
  /** Absolutely positioned content for a day column (meeting blocks). */
  renderOverlay?: (day: number) => ReactNode;
  /** Absolutely positioned content spanning all seven day columns, such as a drag selection. */
  gridOverlay?: ReactNode;
  /** Extra class for a whole day column, for example to tint weekends. */
  columnClass?: (day: number) => string;
  containerProps?: HTMLAttributes<HTMLDivElement>;
  /** Scroll so this hour is at the top on first render. */
  scrollToHour?: number;
  maxHeight?: string;
  /** Pixel height of one 30-minute row. */
  rowHeight?: number;
}

/** Hour lines and fainter half-hour lines, drawn as a background so painted cells join up without seams. */
function gridLines(rowHeight: number): CSSProperties {
  const hour = rowHeight * 2;
  return {
    backgroundImage: [
      `repeating-linear-gradient(to bottom, var(--color-line) 0 1px, transparent 1px ${hour}px)`,
      `repeating-linear-gradient(to bottom, transparent 0 ${rowHeight}px, color-mix(in srgb, var(--color-line) 45%, transparent) ${rowHeight}px ${rowHeight + 1}px, transparent ${rowHeight + 1}px ${hour}px)`,
    ].join(","),
  };
}

/** A 7-column grid with 48 half-hour rows and hour labels. Used by the calendar, editor, and heatmap. */
export function TimeGrid({
  headers,
  cellClass,
  cellProps,
  renderOverlay,
  gridOverlay,
  columnClass,
  containerProps,
  scrollToHour = 7,
  maxHeight = "70vh",
  rowHeight = ROW_H,
}: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollToHour * 2 * rowHeight;
  }, [scrollToHour, rowHeight]);

  const { style: containerStyle, ...restContainer } = containerProps ?? {};

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-[0_1px_0_0_rgb(255_255_255/0.03)_inset]">
      <div className="grid border-b border-line bg-panel-2/60" style={{ gridTemplateColumns: COLUMNS }}>
        <div />
        {headers.map((h, i) => (
          <div
            key={i}
            className={`px-1 py-2.5 text-center text-xs font-semibold tracking-wide text-text/90 ${columnClass?.(i) ?? ""}`}
          >
            {h}
          </div>
        ))}
      </div>
      <div ref={scrollRef} className="overflow-y-auto overscroll-contain" style={{ maxHeight }}>
        <div
          className="relative grid select-none"
          style={{ gridTemplateColumns: COLUMNS, ...containerStyle }}
          {...restContainer}
        >
          <div style={{ gridColumn: 1, gridRow: 1 }}>
            {Array.from({ length: SLOTS_PER_DAY }, (_, slot) => (
              <div key={slot} className="relative" style={{ height: rowHeight }}>
                {slot % 2 === 0 && slot > 0 && (
                  <span className="absolute top-0 right-2 -translate-y-1/2 text-[10px] font-medium text-muted tabular-nums">
                    {String(slot / 2).padStart(2, "0")}:00
                  </span>
                )}
              </div>
            ))}
          </div>
          {headers.map((_, day) => (
            <div
              key={day}
              className={`relative border-l border-line/80 ${columnClass?.(day) ?? ""}`}
              style={{ gridColumn: day + 2, gridRow: 1, ...gridLines(rowHeight) }}
            >
              {Array.from({ length: SLOTS_PER_DAY }, (_, slot) => (
                <div key={slot} className={cellClass?.(day, slot) ?? ""} style={{ height: rowHeight }} {...cellProps?.(day, slot)} />
              ))}
              {renderOverlay && <div className="pointer-events-none absolute inset-0">{renderOverlay(day)}</div>}
            </div>
          ))}
          {gridOverlay && (
            <div className="pointer-events-none relative" style={{ gridColumn: "2 / span 7", gridRow: 1 }}>
              {gridOverlay}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

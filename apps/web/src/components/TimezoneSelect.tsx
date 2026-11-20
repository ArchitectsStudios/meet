"use client";

import { useMemo, useState } from "react";
import { allTimezones, tzLabel } from "@/lib/client";

export function TimezoneSelect({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const [filter, setFilter] = useState("");
  const zones = useMemo(() => {
    const list = allTimezones();
    if (!list.includes(value)) list.unshift(value);
    const f = filter.trim().toLowerCase().replace(/ /g, "_");
    return f ? list.filter((z) => z.toLowerCase().includes(f) || z === value) : list;
  }, [filter, value]);

  return (
    <div className="space-y-2">
      <input className="input" placeholder="Search, for example London or New_York" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <select className="input" size={8} value={value} onChange={(e) => onChange(e.target.value)}>
        {zones.map((z) => (
          <option key={z} value={z}>
            {tzLabel(z)}
          </option>
        ))}
      </select>
    </div>
  );
}

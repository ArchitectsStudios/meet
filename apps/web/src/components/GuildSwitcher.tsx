"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GuildSummary } from "@meet/shared";
import { api } from "@/lib/client";

export function GuildIcon({ guild, size = 24 }: { guild: GuildSummary; size?: number }) {
  if (guild.iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={guild.iconUrl} alt="" className="shrink-0 rounded-md" style={{ width: size, height: size }} />;
  }
  const initials = guild.name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-md bg-line text-[10px] font-semibold text-text"
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}

/** Header menu for picking the active Discord server. Shown only when the user has more than one. */
export function GuildSwitcher({ guilds, activeId }: { guilds: GuildSummary[]; activeId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = guilds.find((g) => g.id === activeId) ?? guilds[0]!;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const choose = async (id: string) => {
    setOpen(false);
    if (id === active.id) return;
    setBusy(true);
    try {
      await api("/api/me/guild", { method: "POST", body: JSON.stringify({ guildId: id }) });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={busy}
        className="flex max-w-56 min-w-0 items-center gap-2 rounded-lg border border-line bg-panel-2 py-1 pr-1.5 pl-1 text-sm transition-colors hover:bg-line disabled:opacity-60 sm:pr-2"
        title="Switch server"
      >
        <GuildIcon guild={active} />
        <span className="hidden truncate font-medium sm:inline">{active.name}</span>
        <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-muted" fill="currentColor" aria-hidden>
          <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-40 mt-1.5 max-h-80 w-64 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-lg border border-line bg-panel p-1 shadow-2xl"
        >
          <li className="px-2 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">Servers</li>
          {guilds.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                role="option"
                aria-selected={g.id === active.id}
                onClick={() => choose(g.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                  g.id === active.id ? "bg-panel-2 text-text" : "text-text/90 hover:bg-panel-2"
                }`}
              >
                <GuildIcon guild={g} />
                <span className="truncate">{g.name}</span>
                {g.id === active.id && <span className="ml-auto text-accent">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

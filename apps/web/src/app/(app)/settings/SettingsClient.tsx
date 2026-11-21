"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AvailabilityBlock } from "@meet/shared";
import { api } from "@/lib/client";
import { AvailabilityEditor } from "@/components/AvailabilityEditor";
import { TimezoneSelect } from "@/components/TimezoneSelect";

/** Feed for one server; the token is shared by all of the user's server feeds. */
const feedUrl = (base: string, guildId: string) => `${base}?guild=${encodeURIComponent(guildId)}`;

export function SettingsClient({
  guildId,
  timezone,
  blocks,
  icsBase,
}: {
  guildId: string;
  timezone: string;
  blocks: AvailabilityBlock[];
  icsBase: string;
}) {
  const router = useRouter();
  const [tz, setTz] = useState(timezone);
  const [tzMsg, setTzMsg] = useState<string | null>(null);
  const [icsUrl, setIcsUrl] = useState(() => feedUrl(icsBase, guildId));
  const [copied, setCopied] = useState(false);

  const saveTz = async () => {
    setTzMsg(null);
    try {
      await api("/api/me", { method: "PATCH", body: JSON.stringify({ timezone: tz }) });
      setTzMsg("Saved");
      router.refresh();
    } catch (err) {
      setTzMsg((err as Error).message);
    }
  };

  const resetIcs = async () => {
    if (!confirm("Make a new calendar link? Calendars subscribed to the old link stop updating.")) return;
    const res = await api<{ icsUrl: string }>("/api/me/ics-token", { method: "POST" });
    setIcsUrl(feedUrl(res.icsUrl, guildId));
  };

  const copy = async () => {
    await navigator.clipboard.writeText(icsUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <h2 className="font-semibold">Weekly availability</h2>
        <AvailabilityEditor
          initialBlocks={blocks}
          onSave={async (b) => {
            await api("/api/availability", { method: "PUT", body: JSON.stringify({ guildId, blocks: b }) });
          }}
        />
        <p className="text-xs text-muted">
          Blocks stay at the same local time in your timezone. If you change timezone, they move with it.
        </p>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="font-semibold">Timezone</h2>
          <TimezoneSelect value={tz} onChange={setTz} />
          <div className="flex items-center gap-3">
            <button className="btn-primary" onClick={saveTz} disabled={tz === timezone}>
              Save timezone
            </button>
            {tzMsg && <span className="text-xs text-muted">{tzMsg}</span>}
          </div>
        </section>

        <section className="card space-y-3">
          <h2 className="font-semibold">Calendar subscription (ICS)</h2>
          <p className="text-sm text-muted">
            Add your meetings to Google Calendar: <em>Other calendars → + → From URL</em>, then paste this link. Google
            refreshes subscribed calendars every few hours, so changes can take a while to appear.
          </p>
          <div className="flex gap-2">
            <input className="input font-mono text-xs" readOnly value={icsUrl} onFocus={(e) => e.target.select()} />
            <button className="btn-ghost shrink-0" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className="btn-ghost" href={icsUrl.replace(/^https?:/, "webcal:")}>
              Open in Apple / Outlook
            </a>
            <button className="btn-ghost" onClick={resetIcs}>
              Reset link
            </button>
          </div>
          <p className="text-xs text-muted">Anyone with this link can see your meetings. Reset it if it leaks.</p>
        </section>
      </div>
    </div>
  );
}

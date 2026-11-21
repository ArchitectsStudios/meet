"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { GuildSummary, RoleSummary, VoiceChannelSummary } from "@meet/shared";
import type { MeetingJson } from "@/lib/meetings";
import { api } from "@/lib/client";
import { GuestPicker, type PickedRole, type PickedUser } from "./GuestPicker";
import { SuggestPanel } from "./SuggestPanel";
import { GuildIcon } from "./GuildSwitcher";

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];
const REMINDERS: { value: number; label: string }[] = [
  { value: 0, label: "No reminder" },
  { value: 5, label: "5 minutes before" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" },
];

interface Props {
  timezone: string;
  meId: string;
  /** Server the meeting belongs to: the active server for a new meeting, the meeting's own when editing. */
  guild: GuildSummary;
  initial?: MeetingJson;
}

function nextHalfHour(tz: string): DateTime {
  const now = DateTime.now().setZone(tz);
  const add = now.minute < 30 ? 30 - now.minute : 60 - now.minute;
  return now.plus({ minutes: add }).startOf("minute");
}

export function MeetingForm({ timezone, meId, guild, initial }: Props) {
  const router = useRouter();
  const start0 = initial ? DateTime.fromISO(initial.start, { zone: timezone }) : nextHalfHour(timezone).plus({ hours: 1 });
  const dur0 = initial ? Math.round((Date.parse(initial.end) - Date.parse(initial.start)) / 60_000) : 60;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(start0.toISODate()!);
  const [time, setTime] = useState(start0.toFormat("HH:mm"));
  const [duration, setDuration] = useState(dur0);
  const [voiceChannelId, setVoiceChannelId] = useState<string | null>(initial?.voiceChannelId ?? null);
  const [reminderMinutes, setReminderMinutes] = useState(initial?.reminderMinutes ?? 15);
  const [agenda, setAgenda] = useState(initial?.agenda ?? "");
  const [agendaTab, setAgendaTab] = useState<"write" | "preview">("write");
  const [users, setUsers] = useState<PickedUser[]>(
    initial?.guests
      .filter((g) => g.direct)
      .map((g) => ({ discordId: g.discordId, displayName: g.displayName, required: g.direct!.required })) ?? [],
  );
  const [roles, setRoles] = useState<PickedRole[]>(
    initial?.roleInvites.map((r) => ({
      roleId: r.roleId,
      name: r.roleName,
      color: "#99aab5",
      memberCount: r.memberIds.filter((id) => id !== initial.organizerId).length,
      required: r.required,
    })) ?? [],
  );
  const [allRoles, setAllRoles] = useState<RoleSummary[]>([]);
  const [voiceChannels, setVoiceChannels] = useState<VoiceChannelSummary[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Switching server in the header while creating a meeting: guests and channels from the old server no longer apply.
  const guildRef = useRef(guild.id);
  useEffect(() => {
    if (guildRef.current === guild.id) return;
    guildRef.current = guild.id;
    setUsers([]);
    setRoles([]);
    setVoiceChannelId(null);
  }, [guild.id]);

  useEffect(() => {
    const q = `guild=${encodeURIComponent(guild.id)}`;
    api<RoleSummary[]>(`/api/discord/roles?${q}`)
      .then((list) => {
        setAllRoles(list);
        // Fill in colours for roles loaded from an existing meeting.
        setRoles((prev) => prev.map((r) => ({ ...r, color: list.find((x) => x.id === r.roleId)?.color ?? r.color })));
      })
      .catch((err) => setError(`Could not load roles: ${(err as Error).message}`));
    api<VoiceChannelSummary[]>(`/api/discord/voice-channels?${q}`)
      .then(setVoiceChannels)
      .catch(() => {});
  }, [guild.id]);

  const start = useMemo(() => DateTime.fromISO(`${date}T${time}`, { zone: timezone }), [date, time, timezone]);
  const end = start.plus({ minutes: duration });
  const durations = DURATIONS.includes(duration) ? DURATIONS : [...DURATIONS, duration].sort((a, b) => a - b);

  /** From Best times: a start, plus an end when the user dragged out a range. */
  const pick = (ms: number, endMs?: number) => {
    const dt = DateTime.fromMillis(ms, { zone: timezone });
    setDate(dt.toISODate()!);
    setTime(dt.toFormat("HH:mm"));
    if (endMs !== undefined && endMs > ms) setDuration(Math.round((endMs - ms) / 60_000));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!start.isValid) return setError("Pick a valid date and time");
    setSaving(true);
    setError(null);
    const body = JSON.stringify({
      guildId: guild.id,
      title,
      agenda,
      start: start.toUTC().toISO(),
      end: end.toUTC().toISO(),
      voiceChannelId,
      reminderMinutes,
      users: users.map((u) => ({ discordId: u.discordId, required: u.required })),
      roles: roles.map((r) => ({ roleId: r.roleId, required: r.required })),
    });
    try {
      if (initial) {
        await api(`/api/meetings/${initial._id}`, { method: "PATCH", body });
        router.push(`/meetings/${initial._id}`);
      } else {
        const res = await api<{ id: string }>("/api/meetings", { method: "POST", body });
        router.push(`/meetings/${res.id}`);
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="space-y-4">
        <div className="card space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted">
            <GuildIcon guild={guild} size={20} />
            <span>
              {initial ? "In" : "Creating in"} <span className="font-medium text-text">{guild.name}</span>
            </span>
          </div>
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" className="input" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label" htmlFor="date">Date</label>
              <input id="date" type="date" className="input" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="time">Start</label>
              <input id="time" type="time" step={300} className="input" required value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="duration">Length</label>
              <select id="duration" className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {durations.map((d) => (
                  <option key={d} value={d}>
                    {d < 60 ? `${d} min` : `${d / 60} h`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted">
            {start.isValid ? `${start.toFormat("cccc d LLLL, HH:mm")} – ${end.toFormat("HH:mm")}` : "Invalid time"} ({timezone})
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="vc">Voice channel</label>
              <select id="vc" className="input" value={voiceChannelId ?? ""} onChange={(e) => setVoiceChannelId(e.target.value || null)}>
                <option value="">None</option>
                {voiceChannels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parent ? `${c.parent} / ` : ""}
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="reminder">Reminder DM</label>
              <select id="reminder" className="input" value={reminderMinutes} onChange={(e) => setReminderMinutes(Number(e.target.value))}>
                {REMINDERS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="card space-y-3">
          <span className="label">Guests</span>
          <GuestPicker guildId={guild.id} meId={meId} roles={allRoles} users={users} pickedRoles={roles} onUsers={setUsers} onRoles={setRoles} />
        </div>

        <div className="card space-y-2">
          <div className="flex items-center gap-2">
            <span className="label mb-0">Agenda</span>
            <div className="ml-auto flex gap-1 text-xs">
              {(["write", "preview"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setAgendaTab(t)}
                  className={`rounded px-2 py-1 capitalize ${agendaTab === t ? "bg-line text-text" : "text-muted hover:text-text"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {agendaTab === "write" ? (
            <textarea
              className="input min-h-40 font-mono"
              placeholder={"Markdown works:\n- Item one\n- [ ] Task"}
              maxLength={10_000}
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
            />
          ) : (
            <div className="prose-agenda min-h-40 rounded-md border border-line bg-panel-2 p-3 text-sm">
              {agenda.trim() ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{agenda}</ReactMarkdown> : <p className="text-muted">Nothing yet.</p>}
            </div>
          )}
        </div>

        {error && <p className="rounded-md border border-unavail/50 bg-unavail/10 p-2 text-sm text-red-200">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : initial ? "Save changes" : "Create and send invites"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => router.back()}>
            Cancel
          </button>
        </div>
      </div>

      <div className="card h-fit space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Best times</h2>
          {!showSuggest && (
            <button type="button" className="btn-ghost" onClick={() => setShowSuggest(true)}>
              Show
            </button>
          )}
        </div>
        {showSuggest ? (
          <SuggestPanel
            guildId={guild.id}
            timezone={timezone}
            users={users}
            roles={roles}
            durationMin={duration}
            date={date}
            selected={start.isValid ? { start: start.toMillis(), end: end.toMillis() } : null}
            excludeMeetingId={initial?._id}
            onPick={pick}
          />
        ) : (
          <p className="text-sm text-muted">
            Add guests, then compare everyone&apos;s weekly availability and existing meetings to find a slot.
          </p>
        )}
      </div>
    </form>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { MemberSummary, RoleSummary } from "@meet/shared";
import { api } from "@/lib/client";

export interface PickedUser {
  discordId: string;
  displayName: string;
  avatarUrl?: string;
  required: boolean;
}

export interface PickedRole {
  roleId: string;
  name: string;
  color: string;
  memberCount: number;
  required: boolean;
}

interface Props {
  meId: string;
  roles: RoleSummary[];
  users: PickedUser[];
  pickedRoles: PickedRole[];
  onUsers: (u: PickedUser[]) => void;
  onRoles: (r: PickedRole[]) => void;
}

function RequiredToggle({ required, onChange }: { required: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!required)}
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${required ? "bg-accent text-white" : "bg-line text-muted"}`}
      title="Click to switch between required and optional"
    >
      {required ? "Required" : "Optional"}
    </button>
  );
}

/** Search box for server members and roles, plus the chosen guests with required/optional toggles. */
export function GuestPicker({ meId, roles, users, pickedRoles, onUsers, onRoles }: Props) {
  const [q, setQ] = useState("");
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      api<MemberSummary[]>(`/api/discord/members?q=${encodeURIComponent(q.replace(/^@/, ""))}`)
        .then(setMembers)
        .catch(() => setMembers([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const needle = q.replace(/^@/, "").toLowerCase();
  const roleMatches = roles
    .filter((r) => !pickedRoles.some((p) => p.roleId === r.id))
    .filter((r) => !needle || r.name.toLowerCase().includes(needle))
    .slice(0, 6);
  const memberMatches = members.filter((m) => m.id !== meId && !users.some((u) => u.discordId === m.id));

  return (
    <div className="space-y-2">
      <div className="relative" ref={boxRef}>
        <input
          className="input"
          placeholder="Add people or @roles"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
        />
        {open && (roleMatches.length > 0 || memberMatches.length > 0) && (
          <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-line bg-panel shadow-xl">
            {roleMatches.map((r) => (
              <button
                key={r.id}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-panel-2"
                onClick={() => {
                  onRoles([...pickedRoles, { roleId: r.id, name: r.name, color: r.color, memberCount: r.memberCount, required: true }]);
                  setQ("");
                }}
              >
                <span className="h-3 w-3 rounded-full" style={{ background: r.color === "#000000" ? "#99aab5" : r.color }} />
                <span>@{r.name}</span>
                <span className="ml-auto text-xs text-muted">{r.memberCount} members</span>
              </button>
            ))}
            {memberMatches.map((m) => (
              <button
                key={m.id}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-panel-2"
                onClick={() => {
                  onUsers([...users, { discordId: m.id, displayName: m.displayName, avatarUrl: m.avatarUrl, required: true }]);
                  setQ("");
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.avatarUrl} alt="" className="h-6 w-6 rounded-full" />
                <span>{m.displayName}</span>
                <span className="text-xs text-muted">@{m.username}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {(pickedRoles.length > 0 || users.length > 0) && (
        <ul className="space-y-1">
          {pickedRoles.map((r) => (
            <li key={r.roleId} className="flex items-center gap-2 rounded-md bg-panel-2 px-2 py-1.5 text-sm">
              <span className="h-3 w-3 rounded-full" style={{ background: r.color === "#000000" ? "#99aab5" : r.color }} />
              <span className="font-medium">@{r.name}</span>
              <span className="text-xs text-muted">{r.memberCount} members</span>
              <span className="ml-auto" />
              <RequiredToggle
                required={r.required}
                onChange={(v) => onRoles(pickedRoles.map((x) => (x.roleId === r.roleId ? { ...x, required: v } : x)))}
              />
              <button type="button" className="px-1 text-muted hover:text-text" aria-label="Remove" onClick={() => onRoles(pickedRoles.filter((x) => x.roleId !== r.roleId))}>
                ×
              </button>
            </li>
          ))}
          {users.map((u) => (
            <li key={u.discordId} className="flex items-center gap-2 rounded-md bg-panel-2 px-2 py-1.5 text-sm">
              {u.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.avatarUrl} alt="" className="h-5 w-5 rounded-full" />
              ) : (
                <span className="h-5 w-5 rounded-full bg-line" />
              )}
              <span>{u.displayName}</span>
              <span className="ml-auto" />
              <RequiredToggle
                required={u.required}
                onChange={(v) => onUsers(users.map((x) => (x.discordId === u.discordId ? { ...x, required: v } : x)))}
              />
              <button type="button" className="px-1 text-muted hover:text-text" aria-label="Remove" onClick={() => onUsers(users.filter((x) => x.discordId !== u.discordId))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">
        Inviting a role invites the people who have it now. Each person gets their own DM and RSVP.
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Rsvp } from "@meet/shared";
import { api } from "@/lib/client";

export function MeetingActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const cancel = async () => {
    if (!confirm("Cancel this meeting? Every guest gets a DM.")) return;
    setBusy(true);
    try {
      await api(`/api/meetings/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Link href={`/meetings/${id}/edit`} className="btn-ghost">
        Edit
      </Link>
      <button className="btn-danger" disabled={busy} onClick={cancel}>
        Cancel meeting
      </button>
    </>
  );
}

const OPTIONS: { value: Exclude<Rsvp, "pending">; label: string; active: string }[] = [
  { value: "accepted", label: "Going", active: "bg-ideal text-white" },
  { value: "maybe", label: "Maybe", active: "bg-warn text-black" },
  { value: "declined", label: "Not going", active: "bg-unavail text-white" },
];

export function RsvpButtons({ id, current }: { id: string; current: Rsvp }) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const set = async (rsvp: Exclude<Rsvp, "pending">) => {
    const prev = value;
    setValue(rsvp);
    try {
      await api(`/api/meetings/${id}/rsvp`, { method: "POST", body: JSON.stringify({ rsvp }) });
      router.refresh();
    } catch (err) {
      setValue(prev);
      alert((err as Error).message);
    }
  };
  return (
    <div className="flex gap-2">
      {OPTIONS.map((o) => (
        <button key={o.value} className={`btn ${value === o.value ? o.active : "bg-panel-2 hover:bg-line"}`} onClick={() => set(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

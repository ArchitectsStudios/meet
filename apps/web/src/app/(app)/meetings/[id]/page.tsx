import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { meetingFit, type FitResult, type Fit, type Guest, type Rsvp } from "@meet/shared";
import { collections } from "@meet/shared/db";
import { requireOnboardedUser } from "@/lib/session";
import { canView, loadMeeting } from "@/lib/meetings";
import { formatRange } from "@/lib/client";
import { MeetingActions, RsvpButtons } from "./MeetingActions";

const RSVP_BADGE: Record<Rsvp, { label: string; cls: string }> = {
  accepted: { label: "Going", cls: "bg-ideal/25 text-green-200" },
  maybe: { label: "Maybe", cls: "bg-warn/25 text-yellow-100" },
  declined: { label: "Not going", cls: "bg-unavail/25 text-red-200" },
  pending: { label: "No answer", cls: "bg-line text-muted" },
};

const FIT_CHIP: Record<Fit, { label: string; cls: string }> = {
  available: { label: "Available", cls: "border-ideal/50 text-ideal-soft" },
  tentative: { label: "Tentative", cls: "border-warn/50 text-yellow-100" },
  unavailable: { label: "Unavailable", cls: "border-unavail/50 text-unavail-soft" },
};

/** Each guest's fit for this meeting's time, from their weekly availability and their other meetings. */
async function guestFits(meeting: { _id?: unknown; start: Date; end: Date; guests: Guest[] }): Promise<Map<string, FitResult>> {
  const ids = meeting.guests.map((g) => g.discordId);
  const { users, availability, meetings } = await collections();
  const [userDocs, availDocs, clashes] = await Promise.all([
    users.find({ discordId: { $in: ids } }, { projection: { discordId: 1, timezone: 1 } }).toArray(),
    availability.find({ discordId: { $in: ids } }).toArray(),
    meetings
      .find(
        {
          _id: { $ne: meeting._id as never },
          status: "scheduled",
          start: { $lt: meeting.end },
          end: { $gt: meeting.start },
          $or: [{ organizerId: { $in: ids } }, { guests: { $elemMatch: { discordId: { $in: ids }, rsvp: { $ne: "declined" } } } }],
        },
        { projection: { start: 1, end: 1, organizerId: 1, guests: 1 } },
      )
      .toArray(),
  ]);
  const tz = new Map(userDocs.map((u) => [u.discordId, u.timezone]));
  const blocks = new Map(availDocs.map((a) => [a.discordId, a.blocks]));
  const out = new Map<string, FitResult>();
  for (const id of ids) {
    const busy = clashes
      .filter((c) => c.organizerId === id || c.guests.some((g) => g.discordId === id && g.rsvp !== "declined"))
      .map((c) => ({ start: c.start.getTime(), end: c.end.getTime() }));
    out.set(
      id,
      meetingFit({ timezone: tz.get(id) ?? null, blocks: blocks.get(id) ?? [] }, { start: meeting.start.getTime(), end: meeting.end.getTime() }, busy),
    );
  }
  return out;
}

function GuestRow({ g, fit }: { g: Guest; fit?: FitResult }) {
  const badge = RSVP_BADGE[g.rsvp];
  const chip = fit ? FIT_CHIP[fit.fit] : null;
  return (
    <li className="flex items-center gap-2 py-1 text-sm">
      <span>{g.displayName}</span>
      {g.organizer ? (
        <span className="text-[10px] text-accent uppercase">organizer</span>
      ) : (
        <span className={`text-[10px] uppercase ${g.required ? "text-accent" : "text-muted"}`}>{g.required ? "required" : "optional"}</span>
      )}
      {g.dmStatus === "failed" && (
        <span className="text-[10px] text-warn" title="The bot could not DM this person. Their DMs may be closed.">
          DM failed
        </span>
      )}
      <span className="ml-auto" />
      {chip && (
        <span className={`rounded-full border px-1.5 py-px text-[10px] font-medium ${chip.cls}`} title={fit!.reason}>
          {chip.label}
        </span>
      )}
      <span className={`rounded px-1.5 py-0.5 text-[11px] ${badge.cls}`}>{badge.label}</span>
    </li>
  );
}

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireOnboardedUser();
  const { id } = await params;
  const m = await loadMeeting(id).catch(() => null);
  if (!m || !canView(m, user.discordId)) notFound();

  const isOrganizer = m.organizerId === user.discordId;
  const fits = m.status === "scheduled" ? await guestFits(m) : new Map<string, FitResult>();
  const me = m.guests.find((g) => g.discordId === user.discordId);
  const organizerGuest = m.guests.find((g) => g.organizer);
  const direct = m.guests.filter((g) => g.direct && !g.organizer);
  const roleOnly = (roleId: string) => m.guests.filter((g) => g.roleIds.includes(roleId));
  const accepted = m.guests.filter((g) => g.rsvp === "accepted").length;
  const vcUrl = m.voiceChannelId ? `https://discord.com/channels/${m.guildId}/${m.voiceChannelId}` : null;
  const cancelled = m.status === "cancelled";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="card space-y-3">
          {cancelled && <p className="rounded bg-unavail/20 px-2 py-1 text-sm text-red-200">This meeting was cancelled.</p>}
          <h1 className={`text-2xl font-semibold ${cancelled ? "line-through opacity-70" : ""}`}>{m.title}</h1>
          <p className="text-sm">
            {formatRange(m.start.getTime(), m.end.getTime(), user.timezone)}{" "}
            <span className="text-muted">({user.timezone.replace(/_/g, " ")})</span>
          </p>
          <p className="text-sm text-muted">Organized by {isOrganizer ? "you" : m.organizerName}</p>
          <div className="flex flex-wrap gap-2">
            {vcUrl && !cancelled && (
              <a href={vcUrl} target="_blank" rel="noreferrer" className="btn-primary">
                Join voice channel
              </a>
            )}
            {isOrganizer && !cancelled && <MeetingActions id={id} />}
          </div>
          {me && !me.organizer && !cancelled && (
            <div className="border-t border-line pt-3">
              <p className="mb-2 text-sm">
                You are {me.required ? <strong>required</strong> : "optional"}. Your answer:
              </p>
              <RsvpButtons id={id} current={me.rsvp} />
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="mb-2 font-semibold">Agenda</h2>
          {m.agenda.trim() ? (
            <div className="prose-agenda text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.agenda}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted">No agenda yet.</p>
          )}
        </div>
      </div>

      <div className="card h-fit space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Guests</h2>
          <span className="text-xs text-muted">
            {accepted}/{m.guests.length} going
          </span>
        </div>
        {(organizerGuest || direct.length > 0) && (
          <ul className="divide-y divide-line/60">
            {organizerGuest && <GuestRow g={organizerGuest} fit={fits.get(organizerGuest.discordId)} />}
            {direct.map((g) => (
              <GuestRow key={g.discordId} g={g} fit={fits.get(g.discordId)} />
            ))}
          </ul>
        )}
        {m.roleInvites.map((r) => {
          const members = roleOnly(r.roleId);
          const going = members.filter((g) => g.rsvp === "accepted").length;
          return (
            <details key={r.roleId} className="rounded-md bg-panel-2 px-3 py-2" open={members.length <= 8}>
              <summary className="cursor-pointer text-sm">
                <span className="font-medium">@{r.roleName}</span>{" "}
                <span className={`text-[10px] uppercase ${r.required ? "text-accent" : "text-muted"}`}>
                  {r.required ? "required" : "optional"}
                </span>
                <span className="float-right text-xs text-muted">
                  {going}/{members.length} going
                </span>
              </summary>
              <ul className="mt-1 divide-y divide-line/60">
                {members.map((g) => (
                  <GuestRow key={g.discordId} g={g} fit={fits.get(g.discordId)} />
                ))}
              </ul>
            </details>
          );
        })}
        {m.guests.length === 0 && <p className="text-sm text-muted">No guests.</p>}
        <Link href="/" className="block text-sm text-muted hover:text-text">
          ← Back to calendar
        </Link>
      </div>
    </div>
  );
}

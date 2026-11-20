import type { MeetingDoc } from "./types";

export interface IcsOptions {
  /** Public app URL, used for event links and UIDs. */
  appUrl: string;
  guildId: string;
  calendarName?: string;
  /** Viewer's Discord ID; sets their PARTSTAT. */
  viewerId: string;
}

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escapes text values per RFC 5545 section 3.3.11. */
export function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

/** Folds lines longer than 75 octets per RFC 5545 section 3.1. */
export function icsFold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length;
    const max = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (currentBytes + size > max) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += ch;
    currentBytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function partstat(meeting: MeetingDoc, viewerId: string): string {
  if (meeting.organizerId === viewerId) return "ACCEPTED";
  const g = meeting.guests.find((x) => x.discordId === viewerId);
  switch (g?.rsvp) {
    case "accepted":
      return "ACCEPTED";
    case "declined":
      return "DECLINED";
    case "maybe":
      return "TENTATIVE";
    default:
      return "NEEDS-ACTION";
  }
}

/** Builds an iCalendar feed for one viewer. */
export function buildIcs(meetings: MeetingDoc[], opts: IcsOptions): string {
  const host = new URL(opts.appUrl).hostname;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//meet//Discord meetings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(opts.calendarName ?? "Meet")}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const m of meetings) {
    const id = m._id!.toString();
    const url = `${opts.appUrl.replace(/\/$/, "")}/meetings/${id}`;
    const descParts = [url];
    if (m.voiceChannelId) {
      descParts.push(`Voice channel: https://discord.com/channels/${opts.guildId}/${m.voiceChannelId}`);
    }
    const me = m.guests.find((g) => g.discordId === opts.viewerId);
    if (me) descParts.push(me.required ? "You are a required guest." : "You are an optional guest.");
    if (m.agenda.trim()) descParts.push("", "Agenda:", m.agenda.trim());

    lines.push(
      "BEGIN:VEVENT",
      `UID:${id}@${host}`,
      `DTSTAMP:${icsDate(m.updatedAt)}`,
      `LAST-MODIFIED:${icsDate(m.updatedAt)}`,
      `CREATED:${icsDate(m.createdAt)}`,
      // SEQUENCE must grow on every change so clients replace the old copy.
      `SEQUENCE:${Math.floor(m.updatedAt.getTime() / 1000)}`,
      `DTSTART:${icsDate(m.start)}`,
      `DTEND:${icsDate(m.end)}`,
      `SUMMARY:${icsEscape(m.title)}`,
      `DESCRIPTION:${icsEscape(descParts.join("\n"))}`,
      `URL:${url}`,
      `STATUS:${m.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
      `ORGANIZER;CN=${icsEscape(m.organizerName)}:mailto:noreply@${host}`,
      `X-MEET-PARTSTAT:${partstat(m, opts.viewerId)}`,
    );
    if (m.voiceChannelId) lines.push(`LOCATION:${icsEscape("Discord voice channel")}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

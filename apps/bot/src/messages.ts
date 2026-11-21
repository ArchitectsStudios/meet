import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type MessageCreateOptions,
} from "discord.js";
import type { Guest, MeetingDoc, Rsvp } from "@meet/shared";
import { env } from "./env";
import { voiceChannelUrl } from "./discord";

export type MessageKind = "invite" | "update" | "cancel" | "reminder" | "removed";

const COLORS: Record<MessageKind, number> = {
  invite: 0x5865f2,
  update: 0xfee75c,
  cancel: 0xed4245,
  reminder: 0x57f287,
  removed: 0x99aab5,
};

/** Kinds where the guest can no longer act on the meeting: no RSVP buttons, agenda, or voice link. */
const CLOSED: ReadonlySet<MessageKind> = new Set(["cancel", "removed"]);

const RSVP_LABEL: Record<Rsvp, string> = {
  pending: "Not answered",
  accepted: "Going",
  maybe: "Maybe",
  declined: "Not going",
};

/** Discord rejects link buttons and embed URLs that point at localhost. */
function isPublicUrl(url: string): boolean {
  const host = new URL(url).hostname;
  return host !== "localhost" && host !== "127.0.0.1" && !host.endsWith(".local");
}

export function meetingUrl(meeting: MeetingDoc): string {
  return `${env.APP_URL.replace(/\/$/, "")}/meetings/${meeting._id!.toString()}`;
}

function heading(kind: MessageKind, meeting: MeetingDoc): string {
  switch (kind) {
    case "invite":
      return `You're invited: ${meeting.title}`;
    case "update":
      return `Updated: ${meeting.title}`;
    case "cancel":
      return `Cancelled: ${meeting.title}`;
    case "reminder":
      return `Starting soon: ${meeting.title}`;
    case "removed":
      return `No longer invited: ${meeting.title}`;
  }
}

function inviteLine(meeting: MeetingDoc, guest: Guest): string {
  const how = guest.required ? "**Required**" : "Optional";
  const roles = guest.roleIds
    .map((id) => meeting.roleInvites.find((r) => r.roleId === id)?.roleName)
    .filter(Boolean)
    .map((n) => `@${n}`);
  const via = [guest.direct ? "you" : null, ...roles].filter(Boolean).join(", ");
  return via ? `${how} (invited: ${via})` : how;
}

export function buildMeetingMessage(kind: MessageKind, meeting: MeetingDoc, guest: Guest): MessageCreateOptions {
  const startUnix = Math.floor(meeting.start.getTime() / 1000);
  const endUnix = Math.floor(meeting.end.getTime() / 1000);
  const url = meetingUrl(meeting);
  const publicUrl = isPublicUrl(url);

  const agenda = meeting.agenda.trim();
  const agendaExcerpt = agenda.length > 700 ? `${agenda.slice(0, 700)}…` : agenda;

  const closed = CLOSED.has(kind);
  const embed = new EmbedBuilder()
    .setColor(COLORS[kind])
    .setTitle(heading(kind, meeting))
    .addFields(
      { name: "When", value: `<t:${startUnix}:F> – <t:${endUnix}:t> (<t:${startUnix}:R>)` },
      { name: "Organizer", value: meeting.organizerName, inline: true },
    );
  if (!closed) {
    embed.addFields({ name: "Your invite", value: inviteLine(meeting, guest), inline: true });
    if (meeting.voiceChannelId) {
      embed.addFields({ name: "Voice channel", value: `[Join voice](${voiceChannelUrl(meeting.guildId, meeting.voiceChannelId)})` });
    }
    if (agendaExcerpt) embed.addFields({ name: "Agenda", value: agendaExcerpt.slice(0, 1024) });
    embed.addFields({ name: "Your RSVP", value: RSVP_LABEL[guest.rsvp], inline: true });
  }
  if (publicUrl && kind !== "removed") embed.setURL(url);
  if (!publicUrl && kind !== "removed") embed.setDescription(url);

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (closed) return { embeds: [embed], components };

  const id = meeting._id!.toString();
  const rsvpRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`rsvp:${id}:accepted`)
      .setLabel("Going")
      .setStyle(guest.rsvp === "accepted" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`rsvp:${id}:maybe`)
      .setLabel("Maybe")
      .setStyle(guest.rsvp === "maybe" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`rsvp:${id}:declined`)
      .setLabel("Not going")
      .setStyle(guest.rsvp === "declined" ? ButtonStyle.Danger : ButtonStyle.Secondary),
  );
  components.push(rsvpRow);
  const linkRow = new ActionRowBuilder<ButtonBuilder>();
  if (publicUrl) linkRow.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Open meeting").setURL(url));
  if (meeting.voiceChannelId) {
    linkRow.addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Join voice").setURL(voiceChannelUrl(meeting.guildId, meeting.voiceChannelId)),
    );
  }
  if (linkRow.components.length) components.push(linkRow);

  return { embeds: [embed], components };
}

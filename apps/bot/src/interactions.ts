import { MessageFlags, type Interaction } from "discord.js";
import { ObjectId } from "mongodb";
import { collections } from "@meet/shared/db";
import type { Rsvp } from "@meet/shared";
import { buildMeetingMessage } from "./messages";

const RSVP_VALUES: ReadonlySet<string> = new Set<Rsvp>(["accepted", "maybe", "declined"]);

export async function handleInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isButton()) return;
  const [prefix, meetingId, status] = interaction.customId.split(":");
  if (prefix !== "rsvp" || !meetingId || !status || !RSVP_VALUES.has(status) || !ObjectId.isValid(meetingId)) return;

  const { meetings } = await collections();
  const updated = await meetings.findOneAndUpdate(
    { _id: new ObjectId(meetingId), status: "scheduled", "guests.discordId": interaction.user.id },
    { $set: { "guests.$.rsvp": status as Rsvp, updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  if (!updated) {
    await interaction.reply({
      content: "This meeting was cancelled, or you are no longer on its guest list.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guest = updated.guests.find((g) => g.discordId === interaction.user.id)!;
  // Rebuild the message so the RSVP field and button styles show the new answer.
  const title = interaction.message.embeds[0]?.title ?? "";
  const kind = title.startsWith("Starting soon") ? "reminder" : title.startsWith("Updated") ? "update" : "invite";
  const msg = buildMeetingMessage(kind, updated, guest);
  await interaction.update({ embeds: msg.embeds, components: msg.components });
}

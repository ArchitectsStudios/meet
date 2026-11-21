import { notFound, redirect } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { loadMeeting, serializeMeeting } from "@/lib/meetings";
import { userGuilds } from "@/lib/guilds";
import { MeetingForm } from "@/components/MeetingForm";

export default async function EditMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireOnboardedUser();
  const { id } = await params;
  const meeting = await loadMeeting(id).catch(() => null);
  if (!meeting) notFound();
  if (meeting.organizerId !== user.discordId || meeting.status !== "scheduled") redirect(`/meetings/${id}`);
  const guild = (await userGuilds(user.discordId)).find((g) => g.id === meeting.guildId) ?? {
    id: meeting.guildId,
    name: "Unknown server",
    iconUrl: null,
  };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Edit meeting</h1>
      <MeetingForm timezone={user.timezone} meId={user.discordId} guild={guild} initial={serializeMeeting(meeting)} />
    </div>
  );
}

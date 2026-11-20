import { notFound, redirect } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { loadMeeting, serializeMeeting } from "@/lib/meetings";
import { MeetingForm } from "@/components/MeetingForm";

export default async function EditMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireOnboardedUser();
  const { id } = await params;
  const meeting = await loadMeeting(id).catch(() => null);
  if (!meeting) notFound();
  if (meeting.organizerId !== user.discordId || meeting.status !== "scheduled") redirect(`/meetings/${id}`);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Edit meeting</h1>
      <MeetingForm timezone={user.timezone} meId={user.discordId} initial={serializeMeeting(meeting)} />
    </div>
  );
}

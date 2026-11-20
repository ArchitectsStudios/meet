import { requireOnboardedUser } from "@/lib/session";
import { MeetingForm } from "@/components/MeetingForm";

export default async function NewMeetingPage() {
  const { user } = await requireOnboardedUser();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">New meeting</h1>
      <MeetingForm timezone={user.timezone} meId={user.discordId} />
    </div>
  );
}

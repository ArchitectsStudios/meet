import { requireOnboardedUser } from "@/lib/session";
import { activeGuild } from "@/lib/guilds";
import { MeetingForm } from "@/components/MeetingForm";

export default async function NewMeetingPage() {
  const { user } = await requireOnboardedUser();
  const { active } = await activeGuild(user.discordId);
  // The layout shows a notice instead of the page when the user has no server.
  if (!active) return null;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">New meeting</h1>
      <MeetingForm timezone={user.timezone} meId={user.discordId} guild={active} />
    </div>
  );
}

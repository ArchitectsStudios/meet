import { collections } from "@meet/shared/db";
import { requireOnboardedUser } from "@/lib/session";
import { WeekCalendar } from "@/components/WeekCalendar";

export default async function HomePage() {
  const { user } = await requireOnboardedUser();
  const { availability } = await collections();
  const avail = await availability.findOne({ discordId: user.discordId });
  return <WeekCalendar timezone={user.timezone} meId={user.discordId} blocks={avail?.blocks ?? []} />;
}

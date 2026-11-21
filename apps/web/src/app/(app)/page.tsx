import Link from "next/link";
import { collections } from "@meet/shared/db";
import { requireOnboardedUser } from "@/lib/session";
import { activeGuild } from "@/lib/guilds";
import { WeekCalendar } from "@/components/WeekCalendar";

export default async function HomePage() {
  const { user } = await requireOnboardedUser();
  const { active } = await activeGuild(user.discordId);
  // The layout shows a notice instead of the page when the user has no server.
  if (!active) return null;
  const { availability } = await collections();
  const avail = await availability.findOne({ discordId: user.discordId, guildId: active.id });
  return (
    <div className="space-y-4">
      {!avail?.blocks.length && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
          <span>You have not set your availability for this server yet, so others see you as free all week.</span>
          <Link href="/settings" className="btn-ghost">
            Set availability
          </Link>
        </div>
      )}
      <WeekCalendar
        key={active.id}
        guildId={active.id}
        timezone={user.timezone}
        meId={user.discordId}
        blocks={avail?.blocks ?? []}
      />
    </div>
  );
}

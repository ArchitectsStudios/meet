import { collections } from "@meet/shared/db";
import { requireOnboardedUser } from "@/lib/session";
import { activeGuild } from "@/lib/guilds";
import { env } from "@/lib/env";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const { user } = await requireOnboardedUser();
  const { active } = await activeGuild(user.discordId);
  // The layout shows a notice instead of the page when the user has no server.
  if (!active) return null;
  const { availability } = await collections();
  const avail = await availability.findOne({ discordId: user.discordId, guildId: active.id });
  const icsBase = `${env().APP_URL.replace(/\/$/, "")}/api/ics/${user.icsToken}.ics`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Availability &amp; settings</h1>
      {/* key: switching server must reload the editor with that server's availability. */}
      <SettingsClient
        key={active.id}
        guildId={active.id}
        timezone={user.timezone}
        blocks={avail?.blocks ?? []}
        icsBase={icsBase}
      />
    </div>
  );
}

import { collections } from "@meet/shared/db";
import { requireOnboardedUser } from "@/lib/session";
import { env } from "@/lib/env";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const { user } = await requireOnboardedUser();
  const { availability } = await collections();
  const avail = await availability.findOne({ discordId: user.discordId });
  const icsUrl = `${env().APP_URL.replace(/\/$/, "")}/api/ics/${user.icsToken}.ics`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Availability &amp; settings</h1>
      <SettingsClient timezone={user.timezone} blocks={avail?.blocks ?? []} icsUrl={icsUrl} />
    </div>
  );
}

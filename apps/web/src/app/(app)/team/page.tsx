import { collections } from "@meet/shared/db";
import { requireOnboardedUser } from "@/lib/session";
import { activeGuild } from "@/lib/guilds";
import { bot } from "@/lib/bot";
import { TeamAvailability, type TeamMember } from "@/components/TeamAvailability";

/** Every registered user who is in the active server, with their availability for that server. */
async function teamFor(guildId: string): Promise<TeamMember[]> {
  const { users, availability } = await collections();
  const registered = await users
    .find({ timezone: { $ne: null } }, { projection: { discordId: 1, timezone: 1 } })
    .toArray();
  const ids = registered.map((u) => u.discordId);

  // The bot looks up at most 500 IDs per call.
  const members = (
    await Promise.all(Array.from({ length: Math.ceil(ids.length / 500) }, (_, i) => bot.lookupMembers(guildId, ids.slice(i * 500, i * 500 + 500))))
  ).flat();
  const avail = await availability.find({ guildId, discordId: { $in: members.map((m) => m.id) } }).toArray();
  const tz = new Map(registered.map((u) => [u.discordId, u.timezone]));
  const blocks = new Map(avail.map((a) => [a.discordId, a.blocks]));

  return members.map((m) => ({
    discordId: m.id,
    displayName: m.displayName,
    avatarUrl: m.avatarUrl,
    timezone: tz.get(m.id) ?? null,
    blocks: blocks.get(m.id) ?? [],
  }));
}

export default async function TeamPage() {
  const { user } = await requireOnboardedUser();
  const { active } = await activeGuild(user.discordId);
  // The layout shows a notice instead of the page when the user has no server.
  if (!active) return null;
  const team = await teamFor(active.id);
  team.sort((a, b) => (a.discordId === user.discordId ? -1 : b.discordId === user.discordId ? 1 : a.displayName.localeCompare(b.displayName)));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Team availability</h1>
      <TeamAvailability key={active.id} members={team} timezone={user.timezone} meId={user.discordId} />
    </div>
  );
}

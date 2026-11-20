import { collections } from "@meet/shared/db";
import { buildIcs } from "@meet/shared";
import { env } from "@/lib/env";
import { meetingsForUser } from "@/lib/meetings";

type Ctx = { params: Promise<{ file: string }> };

export const dynamic = "force-dynamic";

const DAY = 24 * 3600_000;

/**
 * Private ICS feed: /api/ics/<token>.ics. The token is the only credential, so calendar apps
 * (Google Calendar "From URL", Apple, Outlook) can subscribe without a login.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const { file } = await ctx.params;
  const token = file.replace(/\.ics$/, "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return new Response("Not found", { status: 404 });

  const { users, meetings } = await collections();
  const user = await users.findOne({ icsToken: token });
  if (!user) return new Response("Not found", { status: 404 });

  const now = Date.now();
  const list = await meetings
    .find({
      ...meetingsForUser(user.discordId, false),
      end: { $gt: new Date(now - 60 * DAY) },
      // Keep recently cancelled meetings so subscribed calendars remove them.
      $and: [{ $or: [{ status: "scheduled" }, { status: "cancelled", updatedAt: { $gt: new Date(now - 30 * DAY) } }] }],
    })
    .sort({ start: 1 })
    .limit(1000)
    .toArray();

  const body = buildIcs(list, {
    appUrl: env().APP_URL,
    guildId: env().DISCORD_GUILD_ID,
    viewerId: user.discordId,
    calendarName: "Meet",
  });

  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="meet.ics"',
      "cache-control": "private, max-age=300",
    },
  });
}

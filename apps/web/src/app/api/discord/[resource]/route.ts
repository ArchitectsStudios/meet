import { NextResponse, type NextRequest } from "next/server";
import { handler } from "@/lib/api";
import { apiSession, HttpError } from "@/lib/session";
import { bot } from "@/lib/bot";
import { requireGuildMember } from "@/lib/guilds";

type Ctx = { params: Promise<{ resource: string }> };

/**
 * Read-only proxies to the bot, all scoped to one server the user is in:
 * /api/discord/members?guild=&q=, /api/discord/roles?guild=, /api/discord/voice-channels?guild=.
 */
export const GET = handler(async (req: NextRequest, ctx: Ctx) => {
  const s = await apiSession();
  const { resource } = await ctx.params;
  const guildId = req.nextUrl.searchParams.get("guild");
  if (!guildId) throw new HttpError(400, "Missing guild");
  await requireGuildMember(s.sub, guildId);
  switch (resource) {
    case "members":
      return NextResponse.json(await bot.searchMembers(guildId, req.nextUrl.searchParams.get("q") ?? ""));
    case "roles":
      return NextResponse.json(await bot.listRoles(guildId));
    case "voice-channels":
      return NextResponse.json(await bot.listVoiceChannels(guildId));
    default:
      throw new HttpError(404, "Unknown resource");
  }
});

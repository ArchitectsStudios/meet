import { NextResponse, type NextRequest } from "next/server";
import { handler } from "@/lib/api";
import { apiSession, HttpError } from "@/lib/session";
import { bot } from "@/lib/bot";

type Ctx = { params: Promise<{ resource: string }> };

/** Read-only proxies to the bot: /api/discord/members?q=, /api/discord/roles, /api/discord/voice-channels. */
export const GET = handler(async (req: NextRequest, ctx: Ctx) => {
  await apiSession();
  const { resource } = await ctx.params;
  switch (resource) {
    case "members":
      return NextResponse.json(await bot.searchMembers(req.nextUrl.searchParams.get("q") ?? ""));
    case "roles":
      return NextResponse.json(await bot.listRoles());
    case "voice-channels":
      return NextResponse.json(await bot.listVoiceChannels());
    default:
      throw new HttpError(404, "Unknown resource");
  }
});

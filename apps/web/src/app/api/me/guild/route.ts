import { NextResponse } from "next/server";
import { z } from "zod";
import { handler, readJson } from "@/lib/api";
import { apiSession, HttpError } from "@/lib/session";
import { env } from "@/lib/env";
import { ACTIVE_GUILD_COOKIE, userGuilds } from "@/lib/guilds";

/** Sets the active server shown in the header and used for new meetings. */
export const POST = handler(async (req: Request) => {
  const s = await apiSession();
  const { guildId } = z.object({ guildId: z.string() }).parse(await readJson(req));
  const guilds = await userGuilds(s.sub);
  if (!guilds.some((g) => g.id === guildId)) throw new HttpError(403, "You are not a member of that server");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACTIVE_GUILD_COOKIE, guildId, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().APP_URL.startsWith("https://"),
    path: "/",
    maxAge: 365 * 24 * 3600,
  });
  return res;
});

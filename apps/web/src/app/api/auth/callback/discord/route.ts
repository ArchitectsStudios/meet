import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { collections } from "@meet/shared/db";
import { env } from "@/lib/env";
import { bot } from "@/lib/bot";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from "@/lib/session-token";
import { OAUTH_STATE_COOKIE, redirectUri } from "@/lib/oauth";

interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

function fail(req: NextRequest, error: string) {
  const url = new URL("/login", env().APP_URL);
  url.searchParams.set("error", error);
  const res = NextResponse.redirect(url);
  res.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/auth" });
  return res;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!code || !state || !expected || state !== expected) return fail(req, "state");

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env().DISCORD_CLIENT_ID,
      client_secret: env().DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
    }),
  });
  if (!tokenRes.ok) {
    console.error("Discord token exchange failed:", tokenRes.status, await tokenRes.text());
    return fail(req, "oauth");
  }
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const meRes = await fetch("https://discord.com/api/users/@me", {
    headers: { authorization: `Bearer ${access_token}` },
  });
  if (!meRes.ok) return fail(req, "oauth");
  const me = (await meRes.json()) as DiscordUser;

  let member;
  try {
    member = await bot.getMember(me.id);
  } catch {
    return fail(req, "bot");
  }
  if (!member) return fail(req, "not_member");

  const { users } = await collections();
  const now = new Date();
  await users.updateOne(
    { discordId: me.id },
    {
      $set: { username: me.username, globalName: me.global_name, avatar: me.avatar, updatedAt: now },
      $setOnInsert: {
        discordId: me.id,
        timezone: null,
        onboardedAt: null,
        icsToken: randomBytes(24).toString("base64url"),
        createdAt: now,
      },
    },
    { upsert: true },
  );

  const token = await signSession(
    { sub: me.id, name: member.displayName, avatarUrl: member.avatarUrl },
    env().AUTH_SECRET,
  );
  const res = NextResponse.redirect(new URL("/", env().APP_URL));
  res.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/auth" });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().APP_URL.startsWith("https://"),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

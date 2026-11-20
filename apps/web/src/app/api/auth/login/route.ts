import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { OAUTH_STATE_COOKIE, redirectUri } from "@/lib/oauth";

export async function GET() {
  const state = randomBytes(24).toString("base64url");
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", env().DISCORD_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "none");

  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().APP_URL.startsWith("https://"),
    path: "/api/auth",
    maxAge: 600,
  });
  return res;
}

import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { SESSION_COOKIE } from "@/lib/session-token";

function logout() {
  const res = NextResponse.redirect(new URL("/login", env().APP_URL), { status: 303 });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const GET = logout;
export const POST = logout;

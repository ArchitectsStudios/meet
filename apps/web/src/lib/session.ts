import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { collections } from "@meet/shared/db";
import type { UserDoc } from "@meet/shared";
import { env } from "./env";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./session-token";

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value, env().AUTH_SECRET);
}

/** For pages: sends visitors without a session to /login. */
export async function requireSession(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

/** For pages: loads the user and sends them to onboarding if they have not finished it. */
export async function requireOnboardedUser(): Promise<{ session: SessionPayload; user: UserDoc & { timezone: string } }> {
  const session = await requireSession();
  const { users } = await collections();
  const user = await users.findOne({ discordId: session.sub });
  if (!user) redirect("/api/auth/logout");
  if (!user.onboardedAt || !user.timezone) redirect("/onboarding");
  return { session, user: user as UserDoc & { timezone: string } };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** For route handlers: throws 401 without a session. */
export async function apiSession(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Not signed in");
  return s;
}

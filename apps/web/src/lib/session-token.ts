import { SignJWT, jwtVerify } from "jose";

/** Edge-safe session helpers. Used by proxy.ts and server code. */
export const SESSION_COOKIE = "meet_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface SessionPayload {
  /** Discord user ID. */
  sub: string;
  name: string;
  avatarUrl: string;
}

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  return new SignJWT({ name: payload.name, avatarUrl: payload.avatarUrl })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(key(secret));
}

export async function verifySession(token: string | undefined, secret: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    return {
      sub: payload.sub,
      name: String(payload.name ?? ""),
      avatarUrl: String(payload.avatarUrl ?? ""),
    };
  } catch {
    return null;
  }
}

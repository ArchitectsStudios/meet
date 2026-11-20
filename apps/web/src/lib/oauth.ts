import "server-only";
import { env } from "./env";

export const OAUTH_STATE_COOKIE = "meet_oauth_state";

export function redirectUri() {
  return `${env().APP_URL.replace(/\/$/, "")}/api/auth/callback/discord`;
}

import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { collections } from "@meet/shared/db";
import { handler } from "@/lib/api";
import { apiSession } from "@/lib/session";
import { env } from "@/lib/env";

/** Issues a new feed token. Old subscription URLs stop working. */
export const POST = handler(async () => {
  const s = await apiSession();
  const { users } = await collections();
  const icsToken = randomBytes(24).toString("base64url");
  await users.updateOne({ discordId: s.sub }, { $set: { icsToken, updatedAt: new Date() } });
  return NextResponse.json({ icsUrl: `${env().APP_URL.replace(/\/$/, "")}/api/ics/${icsToken}.ics` });
});

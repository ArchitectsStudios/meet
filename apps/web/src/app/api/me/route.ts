import { NextResponse } from "next/server";
import { z } from "zod";
import { collections } from "@meet/shared/db";
import { timezoneSchema } from "@meet/shared";
import { handler, readJson } from "@/lib/api";
import { apiSession, HttpError } from "@/lib/session";
import { env } from "@/lib/env";

export const GET = handler(async () => {
  const s = await apiSession();
  const { users } = await collections();
  const user = await users.findOne({ discordId: s.sub });
  if (!user) throw new HttpError(404, "User not found");
  return NextResponse.json({
    discordId: user.discordId,
    name: s.name,
    avatarUrl: s.avatarUrl,
    timezone: user.timezone,
    onboarded: !!user.onboardedAt,
    icsUrl: `${env().APP_URL.replace(/\/$/, "")}/api/ics/${user.icsToken}.ics`,
  });
});

const patchSchema = z.object({
  timezone: timezoneSchema.optional(),
  onboarded: z.literal(true).optional(),
});

export const PATCH = handler(async (req: Request) => {
  const s = await apiSession();
  const body = patchSchema.parse(await readJson(req));
  const { users } = await collections();
  const user = await users.findOne({ discordId: s.sub });
  if (!user) throw new HttpError(404, "User not found");

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (body.timezone) set.timezone = body.timezone;
  if (body.onboarded) {
    if (!body.timezone && !user.timezone) throw new HttpError(400, "Pick a timezone first");
    set.onboardedAt = user.onboardedAt ?? new Date();
  }
  await users.updateOne({ discordId: s.sub }, { $set: set });
  return NextResponse.json({ ok: true });
});

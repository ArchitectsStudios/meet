import { NextResponse, type NextRequest } from "next/server";
import { collections } from "@meet/shared/db";
import { availabilityInputSchema, normalizeBlocks, type AvailabilityBlock } from "@meet/shared";
import { handler, readJson } from "@/lib/api";
import { apiSession, HttpError } from "@/lib/session";
import { requireGuildMember } from "@/lib/guilds";

/** GET /api/availability?guild=ID: the user's weekly availability for one server. */
export const GET = handler(async (req: NextRequest) => {
  const s = await apiSession();
  const guildId = req.nextUrl.searchParams.get("guild");
  if (!guildId) throw new HttpError(400, "Missing guild");
  const { availability } = await collections();
  const doc = await availability.findOne({ discordId: s.sub, guildId });
  return NextResponse.json({ blocks: doc?.blocks ?? [] });
});

export const PUT = handler(async (req: Request) => {
  const s = await apiSession();
  const body = availabilityInputSchema.parse(await readJson(req));
  await requireGuildMember(s.sub, body.guildId);
  const blocks = normalizeBlocks(body.blocks as AvailabilityBlock[]);
  const { availability } = await collections();
  await availability.updateOne(
    { discordId: s.sub, guildId: body.guildId },
    { $set: { discordId: s.sub, guildId: body.guildId, blocks, updatedAt: new Date() } },
    { upsert: true },
  );
  return NextResponse.json({ blocks });
});

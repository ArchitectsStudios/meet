import { NextResponse } from "next/server";
import { collections } from "@meet/shared/db";
import { availabilityInputSchema, normalizeBlocks, type AvailabilityBlock } from "@meet/shared";
import { handler, readJson } from "@/lib/api";
import { apiSession } from "@/lib/session";

export const GET = handler(async () => {
  const s = await apiSession();
  const { availability } = await collections();
  const doc = await availability.findOne({ discordId: s.sub });
  return NextResponse.json({ blocks: doc?.blocks ?? [] });
});

export const PUT = handler(async (req: Request) => {
  const s = await apiSession();
  const body = availabilityInputSchema.parse(await readJson(req));
  const blocks = normalizeBlocks(body.blocks as AvailabilityBlock[]);
  const { availability } = await collections();
  await availability.updateOne(
    { discordId: s.sub },
    { $set: { discordId: s.sub, blocks, updatedAt: new Date() } },
    { upsert: true },
  );
  return NextResponse.json({ blocks });
});

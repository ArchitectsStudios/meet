import { NextResponse } from "next/server";
import { collections } from "@meet/shared/db";
import { rsvpInputSchema } from "@meet/shared";
import { handler, readJson } from "@/lib/api";
import { apiSession, HttpError } from "@/lib/session";
import { parseId } from "@/lib/meetings";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler(async (req: Request, ctx: Ctx) => {
  const s = await apiSession();
  const { rsvp } = rsvpInputSchema.parse(await readJson(req));
  const { meetings } = await collections();
  const res = await meetings.updateOne(
    { _id: parseId((await ctx.params).id), status: "scheduled", "guests.discordId": s.sub },
    { $set: { "guests.$.rsvp": rsvp, updatedAt: new Date() } },
  );
  if (!res.matchedCount) throw new HttpError(404, "You are not a guest of this meeting");
  return NextResponse.json({ ok: true });
});

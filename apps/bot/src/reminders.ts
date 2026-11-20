import { collections } from "@meet/shared/db";
import { env } from "./env";
import { sendToGuests } from "./notify";

/** Reminders for meetings that started longer ago than this are skipped (for example after downtime). */
const LATE_LIMIT_MS = 10 * 60_000;

/**
 * Claims due meetings one at a time with findOneAndUpdate, so a reminder is sent at most once
 * even if two bot processes ever run at the same time.
 */
export async function runReminderPass(now = new Date()): Promise<number> {
  const { meetings } = await collections();
  let sent = 0;
  for (;;) {
    const meeting = await meetings.findOneAndUpdate(
      {
        status: "scheduled",
        reminderSentAt: null,
        reminderMinutes: { $gt: 0 },
        start: { $gt: new Date(now.getTime() - LATE_LIMIT_MS) },
        $expr: {
          $lte: [{ $subtract: ["$start", { $multiply: ["$reminderMinutes", 60_000] }] }, now],
        },
      },
      { $set: { reminderSentAt: now } },
      { returnDocument: "after" },
    );
    if (!meeting) break;
    await sendToGuests(
      "reminder",
      meeting,
      meeting.guests.filter((g) => g.rsvp !== "declined"),
    );
    sent++;
  }
  return sent;
}

export function startReminderLoop(): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const n = await runReminderPass();
      if (n) console.log(`Sent reminders for ${n} meeting(s)`);
    } catch (err) {
      console.error("Reminder pass failed:", err);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, env.REMINDER_INTERVAL_MS);
  void tick();
  return () => clearInterval(timer);
}

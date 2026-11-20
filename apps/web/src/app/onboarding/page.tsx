import { redirect } from "next/navigation";
import { collections } from "@meet/shared/db";
import { requireSession } from "@/lib/session";
import { OnboardingFlow } from "./OnboardingFlow";

export default async function OnboardingPage() {
  const session = await requireSession();
  const { users, availability } = await collections();
  const user = await users.findOne({ discordId: session.sub });
  if (!user) redirect("/api/auth/logout");
  if (user.onboardedAt && user.timezone) redirect("/");
  const avail = await availability.findOne({ discordId: session.sub });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Welcome, {session.name}</h1>
      <p className="mb-6 text-sm text-muted">Two quick steps so others can find a time that suits you.</p>
      <OnboardingFlow initialTimezone={user.timezone} initialBlocks={avail?.blocks ?? []} />
    </main>
  );
}

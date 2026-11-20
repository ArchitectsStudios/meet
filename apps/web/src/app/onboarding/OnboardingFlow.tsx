"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AvailabilityBlock } from "@meet/shared";
import { api, detectTimezone } from "@/lib/client";
import { AvailabilityEditor } from "@/components/AvailabilityEditor";
import { TimezoneSelect } from "@/components/TimezoneSelect";

export function OnboardingFlow({
  initialTimezone,
  initialBlocks,
}: {
  initialTimezone: string | null;
  initialBlocks: AvailabilityBlock[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [tz, setTz] = useState(initialTimezone ?? "UTC");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!initialTimezone) setTz(detectTimezone());
  }, [initialTimezone]);

  const saveTimezone = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/me", { method: "PATCH", body: JSON.stringify({ timezone: tz }) });
      setStep(2);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const finish = async (blocks: AvailabilityBlock[]) => {
    await api("/api/availability", { method: "PUT", body: JSON.stringify({ blocks }) });
    await api("/api/me", { method: "PATCH", body: JSON.stringify({ onboarded: true }) });
    router.replace("/");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <ol className="flex gap-4 text-sm">
        <li className={step === 1 ? "font-semibold text-text" : "text-muted"}>1. Timezone</li>
        <li className={step === 2 ? "font-semibold text-text" : "text-muted"}>2. Weekly availability</li>
      </ol>

      {step === 1 ? (
        <div className="card max-w-lg space-y-4">
          <div>
            <span className="label">Your timezone</span>
            <TimezoneSelect value={tz} onChange={setTz} />
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <button className="btn-primary" disabled={busy} onClick={saveTimezone}>
            Continue
          </button>
        </div>
      ) : (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">
              Mark when you are <span className="text-red-300">completely unavailable</span>, then when you are{" "}
              <span className="text-green-300">ideally available</span>. Times shown in {tz}.
            </p>
            <button className="text-sm text-muted hover:text-text" onClick={() => setStep(1)}>
              Change timezone
            </button>
          </div>
          <AvailabilityEditor initialBlocks={initialBlocks} onSave={finish} saveLabel="Finish" />
        </div>
      )}
    </div>
  );
}

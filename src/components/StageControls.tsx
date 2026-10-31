"use client";

import { useTransition } from "react";
import { setStage } from "@/lib/myjobs-actions";
import { STAGES } from "@/lib/pipeline";

// Status dropdown for one application, coloured by how far along it is.
export function StageSelect({ applicationId, stage, compact = false }: { applicationId: number; stage: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  const tone =
    stage === "offer"
      ? "border-success/30 bg-success-soft text-success"
      : stage === "rejected"
        ? "border-rose/30 bg-rose-soft text-rose"
        : stage === "saved" || stage === "applying"
          ? "border-border bg-background text-foreground"
          : "border-accent/30 bg-accent-soft text-accent";
  return (
    <select
      aria-label="Status"
      value={stage}
      disabled={pending}
      onChange={(e) => start(() => setStage(applicationId, e.target.value))}
      className={`rounded-lg border font-medium ${tone} ${compact ? "max-w-full px-1.5 py-1 text-xs" : "px-3 py-2 text-sm"} ${pending ? "opacity-60" : ""}`}
    >
      {STAGES.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

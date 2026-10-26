"use client";

import { useTransition } from "react";
import { removeSaved, setStage } from "@/lib/myjobs-actions";
import { STAGES } from "@/lib/pipeline";

export function StageControls({ roleId, stage }: { roleId: number; stage: string }) {
  const [pending, start] = useTransition();
  const notYetApplied = stage === "saved" || stage === "applying";

  return (
    <div className={`flex flex-wrap items-center gap-2 ${pending ? "opacity-60" : ""}`}>
      {notYetApplied && (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => setStage(roleId, "applied"))}
          className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
        >
          Mark as applied
        </button>
      )}
      <select
        aria-label="Stage"
        value={stage}
        disabled={pending}
        onChange={(e) => start(() => setStage(roleId, e.target.value))}
        className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
      >
        {STAGES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      {stage === "saved" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => removeSaved(roleId))}
          className="text-xs text-muted hover:text-foreground"
        >
          Remove
        </button>
      )}
    </div>
  );
}

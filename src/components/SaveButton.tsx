"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleSave } from "@/lib/myjobs-actions";

export function SaveButton({
  roleId,
  saved: initial,
  signedIn,
  large = false,
}: {
  roleId: number;
  saved: boolean;
  signedIn: boolean;
  large?: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  const size = large ? "px-4 py-3 text-sm" : "h-9 w-9 justify-center";

  const icon = (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
      <path d="M6 4h12v16l-6-4-6 4z" />
    </svg>
  );

  if (!signedIn) {
    return (
      <Link
        href={`/sign-in?next=/roles/${roleId}`}
        aria-label="Sign in to save"
        className={`relative z-10 inline-flex items-center gap-2 rounded-lg border border-border bg-surface text-muted hover:text-foreground ${size}`}
      >
        {icon}
        {large && "Save"}
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-label={saved ? "Saved" : "Save"}
      aria-pressed={saved}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setSaved((s) => !s);
          try {
            setSaved(await toggleSave(roleId));
          } catch {
            setSaved(initial);
          }
        })
      }
      className={`relative z-10 inline-flex items-center gap-2 rounded-lg border transition-colors ${size} ${
        saved ? "border-accent/30 bg-accent-soft text-accent" : "border-border bg-surface text-muted hover:text-foreground"
      }`}
    >
      {icon}
      {large && (saved ? "Saved" : "Save")}
    </button>
  );
}

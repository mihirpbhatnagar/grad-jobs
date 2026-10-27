"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleFollow } from "@/lib/myjobs-actions";

// Follow a company: new roles from it are flagged in the morning alert.
export function FollowButton({ companyKey, name, followed: initial, signedIn }: { companyKey: string; name: string; followed: boolean; signedIn: boolean }) {
  const [followed, setFollowed] = useState(initial);
  const [pending, start] = useTransition();
  const cls = `inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold transition-colors ${
    followed ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface text-foreground hover:border-accent/50"
  }`;
  if (!signedIn) {
    return (
      <Link href="/sign-in" className={cls}>
        + Follow
      </Link>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={followed}
      onClick={() =>
        start(async () => {
          setFollowed((f) => !f);
          try {
            setFollowed(await toggleFollow(companyKey, name));
          } catch {
            setFollowed(initial);
          }
        })
      }
      className={cls}
    >
      {followed ? "✓ Following" : "+ Follow"}
    </button>
  );
}

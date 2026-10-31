"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { syncMyInbox } from "@/lib/gmail-actions";

// Quietly checks Gmail for employer replies when My jobs opens (the server skips it if it ran
// in the last few hours), then refreshes the tracker if anything changed.
export function InboxAutoSync() {
  const router = useRouter();
  useEffect(() => {
    syncMyInbox().then((changed) => changed && router.refresh(), () => {});
  }, [router]);
  return null;
}

export function CheckInboxNow() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const changed = await syncMyInbox(true);
            setResult(changed ? `${changed} update${changed === 1 ? "" : "s"} found` : "No new employer emails");
          })
        }
        className="rounded-xl border border-border px-4 py-2 text-sm hover:border-foreground/30"
      >
        {pending ? "Checking…" : "Check now"}
      </button>
      {result && <span className="text-xs text-muted">{result}</span>}
    </span>
  );
}

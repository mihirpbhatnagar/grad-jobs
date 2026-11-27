"use client";

import { useState, useTransition } from "react";
import { saveStoryBank } from "@/lib/myjobs-actions";

const PROMPT = `For example:
• Captain of the uni netball team: ran 3 training sessions a week, 14 players
• Summer job at Decathlon: top seller in footwear in July
• Dissertation on fan engagement: surveyed 200 season-ticket holders`;

// Raw notes on real experiences. The CV tools only ever draw on what's written here.
export function StoryBank({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const [open, setOpen] = useState(!initial);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-5 py-4">
        <div>
          <p className="font-medium">Story bank</p>
          <p className="text-sm text-muted">{text.split("\n").filter(Boolean).length} notes on your experiences</p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:border-foreground/30">
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-accent/30 bg-surface p-5">
      <h2 className="font-semibold tracking-tight">Your story bank</h2>
      <p className="mt-1 text-sm text-muted">
        Jot down real things you&apos;ve done: jobs, societies, sport, projects, results. Rough notes are fine. CV suggestions will only ever use what&apos;s here.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        rows={7}
        placeholder={PROMPT}
        className="mt-3 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm leading-relaxed outline-none focus:border-foreground/40"
      />
      <div className="mt-3 flex items-center justify-end gap-3">
        {saved && <span className="text-sm text-accent">Saved</span>}
        {initial && (
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-foreground">
            Close
          </button>
        )}
        <button
          type="button"
          disabled={pending || !text.trim()}
          onClick={() =>
            start(async () => {
              await saveStoryBank(text);
              setSaved(true);
            })
          }
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save story bank"}
        </button>
      </div>
    </div>
  );
}

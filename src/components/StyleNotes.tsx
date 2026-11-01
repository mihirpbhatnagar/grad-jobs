"use client";

import { useState, useTransition } from "react";
import { saveStyleNotes } from "@/lib/apply-actions";

const EXAMPLE = `For example:
• Keep it plain and direct, short sentences
• I say "ran" and "led", never "spearheaded"
• Lead with sport and matchday work, it's what I'm proudest of`;

// The user's own notes on how they like to sound; every AI rewrite follows them.
export function StyleNotes({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-5 py-4">
        <div>
          <p className="font-medium">How you like to sound</p>
          <p className="text-sm text-muted">{text.trim() ? "Your style notes guide every CV rewrite" : "Optional: tell the CV tools how to write like you"}</p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-foreground/30">
          {text.trim() ? "Edit" : "Add"}
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-accent/30 bg-surface p-5">
      <h2 className="font-semibold tracking-tight">How you like to sound</h2>
      <p className="mt-1 text-sm text-muted">Words you use or avoid, tone, what to lead with. Editing a CV rewrite and saving it as your version teaches it too.</p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        rows={5}
        placeholder={EXAMPLE}
        className="mt-3 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed outline-none focus:border-foreground/40"
      />
      <div className="mt-3 flex items-center justify-end gap-3">
        {saved && <span className="text-sm text-accent">Saved</span>}
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-foreground">
          Close
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await saveStyleNotes(text);
              setSaved(true);
            })
          }
          className="rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
        >
          Save
        </button>
      </div>
    </div>
  );
}

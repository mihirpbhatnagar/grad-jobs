"use client";

import { useState, useTransition } from "react";
import { deleteAccount } from "./actions";

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();

  return (
    <section className="rounded-xl border border-rose/30 bg-surface p-6">
      <h2 className="font-semibold tracking-tight">Delete my account</h2>
      <p className="mt-1 text-sm text-muted">Permanently removes your account, CV, profile, saved roles and application history.</p>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-4 rounded-lg border border-rose/40 px-4 py-2 text-sm text-rose">
          Delete my account
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            Type <span className="font-semibold">delete</span> to confirm
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-1.5 block w-full max-w-xs rounded-lg border border-border bg-background px-4 py-2.5 outline-none focus:border-foreground/40"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={typed.trim().toLowerCase() !== "delete" || pending}
              onClick={() => start(() => deleteAccount())}
              className="rounded-lg bg-rose px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-40"
            >
              {pending ? "Deleting…" : "Delete everything"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm text-muted">
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

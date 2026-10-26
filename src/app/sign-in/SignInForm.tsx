"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

export function SignInForm({ next, confirmed }: { next: string; confirmed: boolean }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [inState, inAction, inPending] = useActionState<AuthState, FormData>(signIn, {});
  const [upState, upAction, upPending] = useActionState<AuthState, FormData>(signUp, {});
  const state = mode === "in" ? inState : upState;
  const pending = mode === "in" ? inPending : upPending;

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
      <div className="grid grid-cols-2 rounded-xl bg-chip p-1 text-sm">
        {(["in", "up"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-lg py-2 font-medium transition-colors ${mode === m ? "bg-surface text-foreground shadow-sm" : "text-muted"}`}
          >
            {m === "in" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      {confirmed && mode === "in" && !state.error && (
        <p className="mt-5 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">Email confirmed. Sign in to continue.</p>
      )}

      <form action={mode === "in" ? inAction : upAction} className="mt-5 space-y-4">
        <input type="hidden" name="next" value={next} />
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-3 outline-none focus:border-foreground/40"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={mode === "up" ? 8 : undefined}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-3 outline-none focus:border-foreground/40"
          />
          {mode === "up" && <span className="mt-1.5 block text-xs text-muted">At least 8 characters.</span>}
        </label>

        {state.error && <p className="text-sm text-rose">{state.error}</p>}
        {state.message && <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">{state.message}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-foreground py-3 font-medium text-background hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}

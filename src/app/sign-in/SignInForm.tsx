"use client";

import { useActionState, useState } from "react";
import { signIn, signInWithGoogle, signUp, type AuthState } from "./actions";

export function SignInForm({ next, confirmed, googleFailed }: { next: string; confirmed: boolean; googleFailed: boolean }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [inState, inAction, inPending] = useActionState<AuthState, FormData>(signIn, {});
  const [upState, upAction, upPending] = useActionState<AuthState, FormData>(signUp, {});
  const state = mode === "in" ? inState : upState;
  const pending = mode === "in" ? inPending : upPending;

  return (
    <div className="rounded-xl border border-border bg-surface p-6 sm:p-8">
      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-background py-3 font-medium hover:border-foreground/30"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
            <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
            <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
            <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
            <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
          </svg>
          Continue with Google
        </button>
      </form>
      {googleFailed && <p className="mt-3 text-sm text-rose">Google sign-in didn&apos;t finish. Try again, or use your email below.</p>}
      <div className="my-5 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        or with email
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="grid grid-cols-2 rounded-lg bg-chip p-1 text-sm">
        {(["in", "up"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-md py-2 font-medium transition-colors ${mode === m ? "bg-surface text-foreground shadow-sm" : "text-muted"}`}
          >
            {m === "in" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      {confirmed && mode === "in" && !state.error && (
        <p className="mt-5 rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent">Email confirmed. Sign in to continue.</p>
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
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-4 py-3 outline-none focus:border-foreground/40"
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
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-4 py-3 outline-none focus:border-foreground/40"
          />
          {mode === "up" && <span className="mt-1.5 block text-xs text-muted">At least 8 characters.</span>}
        </label>

        {state.error && <p className="text-sm text-rose">{state.error}</p>}
        {state.message && <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent">{state.message}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-foreground py-3 font-medium text-background hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}

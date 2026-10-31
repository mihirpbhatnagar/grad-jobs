"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { userClient } from "@/lib/auth";

export type AuthState = { error?: string; message?: string };

// Only allow redirects back into this app.
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/my-jobs";
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const db = await userClient();
  const { error } = await db.auth.signInWithPassword({
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("password") ?? ""),
  });
  if (error) {
    return { error: /confirm/i.test(error.message) ? "Confirm your email first: check your inbox for the link." : "That email and password don't match." };
  }
  redirect(safeNext(form.get("next")));
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters for your password." };
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const db = await userClient();
  const { error } = await db.auth.signUp({
    email: String(form.get("email") ?? "").trim(),
    password,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) return { error: error.message };
  return { message: "Check your email and tap the confirmation link, then sign in here." };
}

// "Continue with Google": Supabase sends the user to Google, then back to /auth/callback.
export async function signInWithGoogle(form: FormData): Promise<void> {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const db = await userClient();
  const { data, error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext(form.get("next")))}` },
  });
  if (error || !data.url) redirect("/sign-in?google=failed");
  redirect(data.url);
}

export async function signOut() {
  const db = await userClient();
  await db.auth.signOut();
  redirect("/");
}

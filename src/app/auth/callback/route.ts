import { NextResponse, type NextRequest } from "next/server";
import { userClient } from "@/lib/auth";

// Google sign-in lands here: swap the one-time code for a session, then carry on.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/my-jobs";
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/my-jobs";
  if (code) {
    const db = await userClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safe, url.origin));
  }
  return NextResponse.redirect(new URL("/sign-in?google=failed", url.origin));
}

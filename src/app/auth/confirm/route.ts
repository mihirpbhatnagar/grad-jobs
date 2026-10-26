import { NextResponse, type NextRequest } from "next/server";
import { userClient } from "@/lib/auth";

// The link in the sign-up email lands here. Supabase has already confirmed the email by
// this point; if the link was opened on the same device we also sign the user straight in.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const db = await userClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/profile", url.origin));
  }
  return NextResponse.redirect(new URL("/sign-in?confirmed=1", url.origin));
}

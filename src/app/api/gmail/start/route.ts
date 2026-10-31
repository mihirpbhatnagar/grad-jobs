import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { consentUrl, gmailAvailable } from "@/lib/gmail";

// "Link Gmail": sends the user to Google's own permission screen (read-only Gmail).
export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const { user } = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in?next=/profile", origin));
  if (!gmailAvailable()) return NextResponse.redirect(new URL("/profile?gmail=off", origin));
  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(consentUrl(`${origin}/api/gmail/callback`, state, user.email));
  response.cookies.set("gmail_state", state, { httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax", maxAge: 600, path: "/api/gmail" });
  return response;
}

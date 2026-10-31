import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { encryptToken, exchangeCode, GMAIL_SCOPE, revokeToken } from "@/lib/gmail";

// Google sends the user back here after the permission screen.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const done = (result: string) => {
    const response = NextResponse.redirect(new URL(`/profile?gmail=${result}#gmail`, url.origin));
    response.cookies.delete({ name: "gmail_state", path: "/api/gmail" });
    return response;
  };
  const { db, user } = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in?next=/profile", url.origin));
  const code = url.searchParams.get("code");
  if (!code || url.searchParams.get("state") !== request.cookies.get("gmail_state")?.value) return done("cancelled");

  try {
    const { refreshToken, scope, email } = await exchangeCode(code, `${url.origin}/api/gmail/callback`);
    if (!refreshToken || !scope.split(" ").includes(GMAIL_SCOPE)) {
      if (refreshToken) await revokeToken(refreshToken);
      return done("no-permission");
    }
    await db.from("gmail_links").delete().eq("user_id", user.id);
    const { error } = await db.from("gmail_links").insert({ user_id: user.id, email: email ?? user.email ?? "", refresh_token: encryptToken(refreshToken) });
    if (error) throw error;
    await db.from("profiles").upsert({ user_id: user.id, gmail_asked_at: new Date().toISOString() });
    return done("linked");
  } catch {
    return done("failed");
  }
}

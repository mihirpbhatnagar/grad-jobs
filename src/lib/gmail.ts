import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Gmail link: read-only access to a user's inbox, used only to spot replies from employers
// they've applied to. Google client id/secret come from the Grad Jobs Google Cloud project.
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const gmailAvailable = () => !!process.env.GOOGLE_CLIENT_SECRET;

const CLIENT_ID = "536589080545-gh0rcf07v88oe0ofee8d65svtvtj0409.apps.googleusercontent.com";
export const googleClientId = () => process.env.GOOGLE_CLIENT_ID ?? CLIENT_ID;

// The stored refresh token is encrypted with a key derived from the Google client secret, which
// only the server has (AES-256-GCM: iv.tag.ciphertext, base64url).
const key = () => createHash("sha256").update(`grad-jobs gmail:${process.env.GOOGLE_CLIENT_SECRET}`).digest();

export function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export function decryptToken(stored: string): string {
  const [iv, tag, body] = stored.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

export function consentUrl(redirectUri: string, state: string, email?: string): string {
  const params = new URLSearchParams({
    client_id: googleClientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: `openid email ${GMAIL_SCOPE}`,
    access_type: "offline", // a refresh token, so the daily sync works without the user present
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    ...(email ? { login_hint: email } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string, redirectUri: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: googleClientId(),
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  const json = (await res.json()) as { refresh_token?: string; access_token: string; scope: string; id_token?: string };
  // The Gmail address comes from the id token (a signed JWT straight from Google over HTTPS).
  const claims = json.id_token ? JSON.parse(Buffer.from(json.id_token.split(".")[1], "base64url").toString()) : {};
  return { refreshToken: json.refresh_token, scope: json.scope, email: (claims.email as string | undefined) ?? null };
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});
}

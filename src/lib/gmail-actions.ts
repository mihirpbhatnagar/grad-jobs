"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { decryptToken, revokeToken } from "@/lib/gmail";

// Removes the Gmail link and tells Google to cancel the permission too.
export async function unlinkGmail(): Promise<void> {
  const { db, user } = await currentUser();
  if (!user) return;
  const { data } = await db.from("gmail_links").select("refresh_token").maybeSingle();
  if (data?.refresh_token) {
    try {
      await revokeToken(decryptToken(data.refresh_token));
    } catch {}
  }
  await db.from("gmail_links").delete().eq("user_id", user.id);
  revalidatePath("/", "layout");
}

// "Not now" on the first-time Gmail question, so it isn't asked again.
export async function dismissGmailQuestion(): Promise<void> {
  const { db, user } = await currentUser();
  if (!user) return;
  await db.from("profiles").upsert({ user_id: user.id, gmail_asked_at: new Date().toISOString() });
  revalidatePath("/", "layout");
}

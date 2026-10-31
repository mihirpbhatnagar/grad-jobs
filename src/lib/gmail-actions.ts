"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { decryptToken, gmailAvailable, revokeToken } from "@/lib/gmail";
import { syncInbox } from "@/lib/inbox";

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

// Checks the user's inbox for employer replies: on opening My jobs (at most every 3 hours) or
// when they press "Check now". Returns how many applications changed.
export async function syncMyInbox(force = false): Promise<number> {
  const { db, user } = await currentUser();
  if (!user || !gmailAvailable()) return 0;
  const { data: link } = await db.from("gmail_links").select("last_synced_at").maybeSingle();
  if (!link) return 0;
  if (!force && link.last_synced_at && Date.now() - new Date(link.last_synced_at).getTime() < 3 * 3_600_000) return 0;
  try {
    const changed = await syncInbox(db, user.id);
    if (changed || force) revalidatePath("/", "layout");
    return changed;
  } catch (e) {
    // Access was cancelled in the Google account: drop the dead link so the profile offers to relink.
    if (e instanceof Error && e.message === "gmail_revoked") await db.from("gmail_links").delete().eq("user_id", user.id);
    return 0;
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { USER_AGENT } from "./employerPages.ts";

// Careers sites often leave a closed job in their sitemap, so "still listed" doesn't prove a job
// is open. A stored page that now answers "not found" (404) or "gone" (410) has closed.
// Wording on the page isn't used: many sites carry a hidden "this job has been filled" notice
// inside every job page, open ones included (checked 10 Nov 2026 on Allianz, P&G, Thales, PwC).

// true = the page is gone; false = it's there; null = couldn't tell (blocked, timed out, site error).
export async function pageGone(url: string): Promise<boolean | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
    await res.body?.cancel().catch(() => undefined);
    if (res.status === 404 || res.status === 410) return true;
    return res.ok ? false : null;
  } catch {
    return null;
  }
}

// Every stored page is looked at once every few days, spread evenly by its address.
export const RECHECK_EVERY_DAYS = 4;
export function dueForCheck(url: string, day = Math.floor(Date.now() / 86_400_000)): boolean {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) >>> 0;
  return (h + day) % RECHECK_EVERY_DAYS === 0;
}

export const GONE_REASON = "page gone";

// Remembers pages that have gone (so the sitemap listing them no longer keeps their role open)
// and closes each role whose employer pages have all gone. Returns how many roles were closed.
export async function closeGonePages(db: SupabaseClient, goneIds: string[]): Promise<number> {
  if (!goneIds.length) return 0;
  const now = new Date().toISOString();
  const roleIds = new Set<number>();
  for (let i = 0; i < goneIds.length; i += 40) {
    const batch = goneIds.slice(i, i + 40);
    const saved = await db.from("excluded_listings").upsert(batch.map((source_id) => ({ source: "employer", source_id, reason: GONE_REASON, last_seen: now })), { onConflict: "source,source_id" });
    if (saved.error) throw new Error(saved.error.message);
    const { data, error } = await db.from("role_sources").select("role_id").eq("source", "employer").in("source_id", batch);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) roleIds.add(r.role_id);
  }
  const toClose: number[] = [];
  for (const roleId of roleIds) {
    const { data: links, error } = await db.from("role_sources").select("source_id").eq("role_id", roleId).eq("source", "employer");
    if (error) throw new Error(error.message);
    const ids = (links ?? []).map((l) => l.source_id);
    let gone = 0;
    for (let i = 0; i < ids.length; i += 40) {
      const { data, error: e2 } = await db.from("excluded_listings").select("source_id").eq("source", "employer").eq("reason", GONE_REASON).in("source_id", ids.slice(i, i + 40));
      if (e2) throw new Error(e2.message);
      gone += data?.length ?? 0;
    }
    if (ids.length > 0 && gone === ids.length) toClose.push(roleId);
  }
  for (let i = 0; i < toClose.length; i += 200) {
    const { error } = await db.from("roles").update({ is_open: false }).in("id", toClose.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
  return toClose.length;
}

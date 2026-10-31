import type { SupabaseClient } from "@supabase/supabase-js";
import { selectAll } from "./db.ts";
import { textKey } from "./normalise.ts";

// Recruiters (e.g. Pareto) re-post the same job in the same town with slightly different
// wording, so each copy gets its own role. Keep one open per employer + title + town: the one
// a user has saved, else the oldest. Run every morning, since the copies are re-saved daily.
export async function closeReposts(db: SupabaseClient): Promise<number> {
  const open = await selectAll<{ id: number; title: string; location: string | null; company_key: string | null }>((from, to) =>
    db.from("roles").select("id,title,location,company_key").eq("is_open", true).order("id").range(from, to),
  );
  const saved = new Set(
    (await selectAll<{ role_id: number }>((from, to) => db.from("saved_roles").select("role_id").order("role_id").range(from, to))).map((r) => r.role_id),
  );
  const groups = new Map<string, number[]>();
  for (const r of open) {
    if (!r.company_key) continue;
    const k = `${r.company_key}|${textKey(r.title)}|${textKey(r.location ?? "")}`;
    groups.set(k, [...(groups.get(k) ?? []), r.id]);
  }
  const extra: number[] = [];
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    const keep = ids.find((id) => saved.has(id)) ?? Math.min(...ids);
    extra.push(...ids.filter((id) => id !== keep));
  }
  for (let i = 0; i < extra.length; i += 200) {
    const { error } = await db.from("roles").update({ is_open: false }).in("id", extra.slice(i, i + 200));
    if (error) throw error;
  }
  return extra.length;
}

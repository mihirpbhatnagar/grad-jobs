import type { SupabaseClient } from "@supabase/supabase-js";
import { SPORTS_EMPLOYER_EXACT, SPORTS_EMPLOYER_STARTS } from "./matching.ts";
import { FIELDS, type ProfileAnswers } from "./profile.ts";

// Which roles For you ranks. Loading every open role with its description on each visit is too
// much (6,000+), and loading "the first 1,000" silently left most roles out. So this loads the
// roles that can match: every role whose title or employer contains a keyword of a chosen field,
// plus the roles closest in meaning to the user's goals (ids from match_roles).
const PAGE = 1000;
const MAX_ROLES = 8000;

type Row = { id: number } & Record<string, unknown>;

export async function forYouCandidates(pub: SupabaseClient, columns: string, a: ProfileAnswers, similarIds: number[]): Promise<Row[]> {
  const base = () =>
    pub.from("roles").select(columns).eq("is_open", true).eq("kind", "job").eq("part_time", false).in("start_status", ["confirmed", "likely"]);
  const byId = new Map<number, Row>();
  const keep = (rows: unknown) => {
    for (const r of (rows ?? []) as Row[]) byId.set(r.id, r);
    return ((rows ?? []) as Row[]).length;
  };

  const words = a.fields.forYou
    ? [...new Set(FIELDS.filter((f) => a.fields.value.includes(f.id)).flatMap((f) => f.keywords.map((k) => k.trim())))]
    : [];
  if (words.length) {
    // With sport chosen, every role at a known sports employer too, whatever its title.
    const sportsEmployers = a.fields.value.includes("sports")
      ? [...SPORTS_EMPLOYER_STARTS.flatMap((n) => [`employer.ilike.${n}*`, `employer.ilike.the ${n}*`]), ...SPORTS_EMPLOYER_EXACT.map((n) => `employer.ilike.${n}`)]
      : [];
    const either = [...words.flatMap((w) => [`title.ilike.*${w}*`, `employer.ilike.*${w}*`]), ...sportsEmployers].join(",");
    for (let from = 0; from < MAX_ROLES; from += PAGE) {
      const { data } = await base().or(either).order("id").range(from, from + PAGE - 1);
      if (keep(data) < PAGE) break;
    }
  }

  const missing = similarIds.filter((id) => !byId.has(id));
  for (let i = 0; i < missing.length; i += 200) {
    const { data } = await base().in("id", missing.slice(i, i + 200));
    keep(data);
  }

  // No fields switched on and no goals yet: the newest roles.
  if (!byId.size) {
    const { data } = await base().order("id", { ascending: false }).limit(PAGE);
    keep(data);
  }
  return [...byId.values()];
}

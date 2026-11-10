import type { SupabaseClient } from "@supabase/supabase-js";
import { rankForYou, SPORTS_EMPLOYER_EXACT, SPORTS_EMPLOYER_STARTS } from "./matching.ts";
import { FIELDS, type ProfileAnswers } from "./profile.ts";
import type { Role } from "./roles.ts";

// Which roles For you ranks, in two steps so the page stays quick.
//
// Loading every open role with its description on each visit is too much (6,000+ roles), and
// loading "the first 1,000" silently left most roles out. So:
//  1. Shortlist (this file, light data, requests side by side): every role whose title or employer
//     contains a keyword of a chosen field, every role at a known sports employer when sport is
//     chosen, and the 1,000 roles closest in meaning to the user's goals. These are ranked on
//     everything except the description, and the best SHORTLIST are kept.
//  2. The page then loads those few in full and ranks them again with their descriptions.
const PAGE = 1000;
const MAX_PAGES = 8;
export const SHORTLIST = 300;
const LIGHT_COLUMNS = "id,title,employer,location,locations,salary_min,salary_max,tags,sponsor_status,last_seen";

type Row = { id: number } & Record<string, unknown>;
export type Shortlist = { total: number; ids: number[]; similarity: [number, number][] };

export async function forYouShortlist(pub: SupabaseClient, a: ProfileAnswers, goalEmbedding: string | null): Promise<Shortlist> {
  const base = () =>
    pub.from("roles").select(LIGHT_COLUMNS).eq("is_open", true).eq("kind", "job").eq("part_time", false).in("start_status", ["confirmed", "likely"]);
  const rowsOf = (res: { data: unknown }) => (res.data ?? []) as Row[];

  const words = a.fields.forYou
    ? [...new Set(FIELDS.filter((f) => a.fields.value.includes(f.id)).flatMap((f) => f.keywords.map((k) => k.trim())))]
    : [];
  // One pattern per column (the database answers this about three times faster than a separate
  // "contains" test for every keyword). With sport chosen, every role at a known sports employer
  // too, whatever its title.
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const anyWord = `(${words.map(esc).join("|")})`;
  const sportsEmployers = a.fields.value.includes("sports")
    ? [`employer.imatch."^(the )?(${SPORTS_EMPLOYER_STARTS.map(esc).join("|")})"`, `employer.imatch."^(${SPORTS_EMPLOYER_EXACT.map(esc).join("|")})$"`]
    : [];
  const either = [`title.imatch."${anyWord}"`, `employer.imatch."${anyWord}"`, ...sportsEmployers].join(",");
  const keywordPage = (page: number) => base().or(either).order("id").range(page * PAGE, (page + 1) * PAGE - 1);

  // Side by side: the closest-in-meaning list and the first three pages of keyword matches.
  const [close, ...pages] = await Promise.all([
    goalEmbedding ? pub.rpc("match_roles", { query: goalEmbedding, max_results: 1000 }) : Promise.resolve({ data: [] }),
    ...(words.length ? [keywordPage(0), keywordPage(1), keywordPage(2)] : []),
  ]);
  const similarity = new Map<number, number>();
  for (const c of (close.data ?? []) as { id: number; similarity: number }[]) similarity.set(c.id, c.similarity);

  const byId = new Map<number, Row>();
  for (const p of pages) for (const r of rowsOf(p)) byId.set(r.id, r);
  // A profile with many fields ticked can match more than three pages.
  for (let page = 3; words.length && rowsOf(pages[pages.length - 1]).length === PAGE && page < MAX_PAGES; page++) {
    const more = rowsOf(await keywordPage(page));
    for (const r of more) byId.set(r.id, r);
    if (more.length < PAGE) break;
  }

  const missing = [...similarity.keys()].filter((id) => !byId.has(id));
  const chunks: number[][] = [];
  for (let i = 0; i < missing.length; i += 200) chunks.push(missing.slice(i, i + 200));
  for (const res of await Promise.all(chunks.map((ids) => base().in("id", ids)))) for (const r of rowsOf(res)) byId.set(r.id, r);

  // No fields switched on and no goals yet: the newest roles.
  if (!byId.size) for (const r of rowsOf(await base().order("id", { ascending: false }).limit(PAGE))) byId.set(r.id, r);

  const ranked = rankForYou([...byId.values()] as unknown as Role[], a, similarity);
  const ids = ranked.slice(0, SHORTLIST).map((m) => m.role.id);
  return { total: ranked.length, ids, similarity: ids.filter((id) => similarity.has(id)).map((id) => [id, similarity.get(id)!]) };
}

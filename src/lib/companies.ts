import { brandKey } from "./brand";
import { publicClient } from "./supabase";

// Company facts and logos gathered by the daily job (Wikidata, Wikipedia, employers' pages).
export type Company = {
  key: string;
  name: string;
  description: string | null;
  summary: string | null;
  wikipedia_url: string | null;
  industry: string | null;
  hq: string | null;
  founded: number | null;
  employees: number | null;
  website: string | null;
  domain: string | null;
  logo_url: string | null;
};

const COLUMNS = "key,name,description,summary,wikipedia_url,industry,hq,founded,employees,website,domain,logo_url";

export async function companiesFor(keys: (string | null | undefined)[]): Promise<Map<string, Company>> {
  const wanted = [...new Set(keys.filter((k): k is string => !!k))];
  const db = publicClient();
  if (!db || wanted.length === 0) return new Map();
  // An arm of a company ("uniqlo europe", "tesco uk") uses the main company's profile and logo
  // when it has none of its own.
  const brands = new Map(wanted.map((k) => [k, brandKey(k)] as const).filter(([k, b]) => b !== k && b.length >= 4));
  const { data } = await db.from("companies").select(COLUMNS).in("key", [...new Set([...wanted, ...brands.values()])]);
  const byKey = new Map(((data ?? []) as Company[]).map((c) => [c.key, c]));
  const hasProfile = (c: Company | undefined) => !!c && !!(c.description || c.summary || c.logo_url || c.domain);
  const out = new Map<string, Company>();
  for (const k of wanted) {
    const own = byKey.get(k);
    const parent = brands.has(k) ? byKey.get(brands.get(k)!) : undefined;
    const pick = hasProfile(own) ? own : hasProfile(parent) ? parent : own;
    if (pick) out.set(k, pick);
  }
  return out;
}

export async function companyFor(key: string | null): Promise<Company | null> {
  return key ? ((await companiesFor([key])).get(key) ?? null) : null;
}

// "143,125 employees" -> "140k+ employees"; small numbers stay exact.
export function sizeLabel(n: number | null): string | null {
  if (!n) return null;
  if (n >= 10_000) return `${Math.floor(n / 1000).toLocaleString("en-GB")}k+ employees`;
  if (n >= 1000) return `${(Math.floor(n / 100) / 10).toFixed(1).replace(/\.0$/, "")}k employees`;
  return `${n} employees`;
}

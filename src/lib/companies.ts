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
  const { data } = await db.from("companies").select(COLUMNS).in("key", wanted);
  return new Map(((data ?? []) as Company[]).map((c) => [c.key, c]));
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

import { companyKey } from "./normalise.ts";
import { USER_AGENT } from "./employerPages.ts";

// Free company facts from Wikidata (what they do, industry, HQ, founded, size, website, logo)
// and a three-line summary from Wikipedia. Big employers are almost all there; small firms
// and recruiters usually aren't, and get a lettered logo (or their site's icon) instead.

export type Company = {
  key: string;
  name: string;
  wikidata_id: string | null;
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
  checked_at: string;
};

const WIKIDATA = "https://www.wikidata.org/w/api.php";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string): Promise<T | null> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
      if (res.status === 429 || res.status >= 500) throw new Error(String(res.status));
      return res.ok ? ((await res.json()) as T) : null;
    } catch {
      await sleep(3000 * attempt);
    }
  }
  return null;
}

type Claim = { mainsnak: { datavalue?: { value: unknown } }; rank: string; qualifiers?: Record<string, { datavalue?: { value: unknown } }[]> };
type Entity = {
  id: string;
  labels?: Record<string, { value: string }>;
  aliases?: Record<string, { value: string }[]>;
  descriptions?: Record<string, { value: string }>;
  claims?: Record<string, Claim[]>;
  sitelinks?: Record<string, { title: string }>;
};

async function entities(ids: string[], props: string): Promise<Record<string, Entity>> {
  const out: Record<string, Entity> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50).join("|");
    const res = await getJson<{ entities: Record<string, Entity> }>(
      `${WIKIDATA}?action=wbgetentities&ids=${batch}&props=${props}&languages=en&sitefilter=enwiki&format=json`,
    );
    Object.assign(out, res?.entities ?? {});
  }
  return out;
}

const values = (e: Entity, prop: string) =>
  (e.claims?.[prop] ?? []).filter((c) => c.rank !== "deprecated" && c.mainsnak.datavalue).sort((a, b) => (a.rank === "preferred" ? -1 : b.rank === "preferred" ? 1 : 0));
const firstValue = (e: Entity, prop: string) => values(e, prop)[0]?.mainsnak.datavalue?.value;
const entityId = (v: unknown) => (v as { id?: string } | undefined)?.id ?? null;

// An organisation, not a person, place or piece of software that happens to share the name.
const isOrganisation = (e: Entity) => ["P452", "P1128", "P159", "P414"].some((p) => values(e, p).length > 0);
// Several matches (e.g. a group and a thin UK registration entry): prefer the best-described.
const richness = (e: Entity) =>
  (e.sitelinks?.enwiki ? 3 : 0) + ["P452", "P1128", "P159", "P154", "P856", "P571"].filter((p) => values(e, p).length > 0).length;

function nameMatches(e: Entity, key: string): boolean {
  const names = [e.labels?.en?.value, ...(e.aliases?.en ?? []).map((a) => a.value)].filter(Boolean) as string[];
  return names.some((n) => {
    const k = companyKey(n);
    return k === key || k === `${key} uk` || `${k} uk` === key || k === `${key} group` || `${k} group` === key;
  });
}

function latestEmployees(e: Entity): number | null {
  const claims = values(e, "P1128");
  let best: { n: number; when: string } | null = null;
  for (const c of claims) {
    const n = Number((c.mainsnak.datavalue?.value as { amount?: string })?.amount);
    const when = String((c.qualifiers?.P585?.[0]?.datavalue?.value as { time?: string })?.time ?? "");
    if (Number.isFinite(n) && (!best || when > best.when)) best = { n, when };
  }
  return best ? Math.round(best.n) : null;
}

const domainOf = (url: string | null) => {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

// Looks up each employer (by name) and returns a row for every one, found or not.
export async function lookupCompanies(names: Map<string, string>): Promise<Company[]> {
  const now = new Date().toISOString();
  const found = new Map<string, string>(); // employer key -> Wikidata id
  for (const key of names.keys()) {
    await sleep(150);
    const res = await getJson<{ search: { id: string }[] }>(
      `${WIKIDATA}?action=wbsearchentities&search=${encodeURIComponent(key)}&language=en&uselang=en&type=item&limit=5&format=json`,
    );
    const ids = (res?.search ?? []).map((s) => s.id);
    if (!ids.length) continue;
    const cands = await entities(ids, "labels|aliases|claims|sitelinks");
    const hit = ids
      .map((id) => cands[id])
      .filter((e) => e && nameMatches(e, key) && isOrganisation(e))
      .sort((a, b) => richness(b) - richness(a))[0];
    if (hit) found.set(key, hit.id);
  }

  const full = await entities([...new Set(found.values())], "labels|descriptions|claims|sitelinks");
  // Labels for the headquarters and industry items, fetched together.
  const linked = new Set<string>();
  for (const e of Object.values(full)) {
    for (const p of ["P159", "P452"]) {
      const id = entityId(firstValue(e, p));
      if (id) linked.add(id);
    }
  }
  const labels = await entities([...linked], "labels");
  const label = (id: string | null) => (id ? labels[id]?.labels?.en?.value ?? null : null);

  const rows: Company[] = [];
  for (const [key, name] of names) {
    const e = found.has(key) ? full[found.get(key)!] : undefined;
    if (!e) {
      rows.push({ key, name, wikidata_id: null, description: null, summary: null, wikipedia_url: null, industry: null, hq: null, founded: null, employees: null, website: null, domain: null, logo_url: null, checked_at: now });
      continue;
    }
    const website = (firstValue(e, "P856") as string | undefined) ?? null;
    const logoFile = (firstValue(e, "P154") as string | undefined) ?? null;
    const inception = (firstValue(e, "P571") as { time?: string } | undefined)?.time;
    const wikiTitle = e.sitelinks?.enwiki?.title ?? null;
    let summary: string | null = null;
    if (wikiTitle) {
      await sleep(100);
      const page = await getJson<{ extract?: string }>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle.replace(/ /g, "_"))}`);
      summary = page?.extract?.split(/(?<=\.)\s+/).slice(0, 3).join(" ") || null;
    }
    rows.push({
      key,
      name: e.labels?.en?.value ?? name,
      wikidata_id: e.id,
      description: e.descriptions?.en?.value ?? null,
      summary,
      wikipedia_url: wikiTitle ? `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle.replace(/ /g, "_"))}` : null,
      industry: label(entityId(firstValue(e, "P452"))),
      hq: label(entityId(firstValue(e, "P159"))),
      founded: inception ? Number(inception.slice(1, 5)) || null : null,
      employees: latestEmployees(e),
      website,
      domain: domainOf(website),
      logo_url: logoFile ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(logoFile.replace(/ /g, "_"))}?width=160` : null,
      checked_at: now,
    });
  }
  return rows;
}

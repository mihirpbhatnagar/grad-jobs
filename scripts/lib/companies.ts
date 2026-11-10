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
      `${WIKIDATA}?action=wbgetentities&ids=${batch}&props=${props}&languages=en|mul&sitefilter=enwiki&format=json`,
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
// A same-named thing that isn't an employer of graduates: a club, a place, a work of art.
export const NOT_EMPLOYER = /(football club|association football|rugby (union |league )?club|cricket club|village|town in|city in|county|civil parish|river|album|film|band|song|novel|television|politician|footballer|given name|surname|family name|asteroid|genus|species)/i;

// Several matches (e.g. a group and a thin UK registration entry): prefer the best-described.
const richness = (e: Entity) =>
  (e.sitelinks?.enwiki ? 3 : 0) + ["P452", "P1128", "P159", "P154", "P856", "P571"].filter((p) => values(e, p).length > 0).length;

// Words at the end of a name that don't change which company it means: legal forms ("Adidas AG",
// "Aon plc"), "Group", "UK", and the labels employers put on their careers accounts ("Stantec UK
// Careers", "Graphcore Early Careers", "WSP in the UK & Ireland"). adidas had no profile because
// its entry is called "Adidas AG".
const NAME_NOISE = new Set(["ag", "se", "sa", "nv", "bv", "gmbh", "plc", "inc", "corp", "corporation", "group", "holdings", "uk", "ireland", "gb", "careers", "career", "early", "graduates", "graduate", "recruitment", "team", "in", "and"]);
export function bareName(key: string): string {
  const words = key.split(" ");
  while (words.length > 1 && NAME_NOISE.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

// Wikidata stores some names once for all languages ("mul") instead of in English.
const labelOf = (e: Entity | undefined) => e?.labels?.en?.value ?? e?.labels?.mul?.value ?? null;

// "exact": the same name (allowing a trailing "UK" or "Group"), as before. "loose": the same once
// legal forms and careers-account labels are dropped; only trusted when the website agrees too.
function nameMatch(e: Entity, key: string): "exact" | "loose" | null {
  const names = [labelOf(e), ...(e.aliases?.en ?? []).map((a) => a.value), ...(e.aliases?.mul ?? []).map((a) => a.value)].filter(Boolean) as string[];
  const keys = names.map((n) => companyKey(n));
  if (keys.some((k) => k === key || k === `${key} uk` || `${k} uk` === key || k === `${key} group` || `${k} group` === key)) return "exact";
  const wanted = bareName(key);
  return keys.some((k) => bareName(k) === wanted) ? "loose" : null;
}

// "adidas-group.com" and "www.adidas-group.com/en" are the same site; so are "pwc.co.uk" and "pwc.com".
function siteName(urlOrDomain: string | null | undefined): string | null {
  if (!urlOrDomain) return null;
  const host = urlOrDomain.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase().replace(/^www\./, "");
  const parts = host.split(".");
  if (parts.length < 2) return null;
  const twoPartEnding = /^(co|com|org|ac|gov|net)$/.test(parts[parts.length - 2]) && parts[parts.length - 1].length === 2;
  return parts[parts.length - (twoPartEnding ? 3 : 2)] ?? null;
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

// A company's website from its name (Clearbit's free name search, no account), for firms
// that aren't on Wikidata. Only an exact name match is taken; UK sites win a tie.
export async function domainFor(name: string): Promise<string | null> {
  const key = bareName(companyKey(name));
  if (key.length < 3) return null;
  const res = await getJson<{ name: string; domain: string }[]>(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(key)}`);
  const same = (res ?? []).filter((c) => {
    const k = bareName(companyKey(c.name));
    return k === key || k === `${key} uk` || `${k} uk` === key || k === `${key} group` || `${k} group` === key;
  });
  const pick = same.find((c) => /\.(co\.)?uk$/.test(c.domain)) ?? same[0];
  return pick?.domain ?? null;
}

// Looks up each employer (by name) and returns a row for every one, found or not.
export async function lookupCompanies(names: Map<string, string>): Promise<Company[]> {
  const now = new Date().toISOString();
  const found = new Map<string, string>(); // employer key -> Wikidata id
  for (const key of names.keys()) {
    await sleep(150);
    const res = await getJson<{ search: { id: string }[] }>(
      // (ten results, not five: for short names like "Aon" the company comes after surnames and species)
      `${WIKIDATA}?action=wbsearchentities&search=${encodeURIComponent(bareName(key))}&language=en&uselang=en&type=item&limit=10&format=json`,
    );
    const ids = (res?.search ?? []).map((s) => s.id);
    if (!ids.length) continue;
    const cands = await entities(ids, "labels|aliases|descriptions|claims|sitelinks");
    const usable = ids
      .map((id) => cands[id])
      .filter((e) => e && isOrganisation(e) && !(NOT_EMPLOYER.test(e.descriptions?.en?.value ?? "") && !/(fc|club|united|city)/i.test(key)));
    const named = usable.map((e) => ({ e, kind: nameMatch(e, key) })).filter((m) => m.kind);
    let hit: Entity | undefined;
    if (named.length) {
      // Two companies can share a name (GHD the engineers and GHD the hair brand), so the website
      // decides where it can. A looser name match counts only when its website is the employer's.
      // An exact match is passed over when the name is a short one (an acronym) and its website
      // is a different site from the employer's.
      const site = siteName(await domainFor(names.get(key)!));
      const siteOf = (e: Entity) => siteName(firstValue(e, "P856") as string | undefined);
      const trusted = named.filter((m) => (m.kind === "exact" ? !(key.length <= 4 && site && siteOf(m.e) && siteOf(m.e) !== site) : !!site && siteOf(m.e) === site));
      hit = trusted.sort((a, b) => Number(b.kind === "exact") - Number(a.kind === "exact") || richness(b.e) - richness(a.e))[0]?.e;
    }
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
  const label = (id: string | null) => (id ? labelOf(labels[id]) : null);

  const rows: Company[] = [];
  for (const [key, name] of names) {
    const e = found.has(key) ? full[found.get(key)!] : undefined;
    if (!e) {
      await sleep(100);
      const domain = await domainFor(name);
      rows.push({ key, name, wikidata_id: null, description: null, summary: null, wikipedia_url: null, industry: null, hq: null, founded: null, employees: null, website: domain ? `https://${domain}` : null, domain, logo_url: null, checked_at: now });
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
      name: labelOf(e) ?? name,
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

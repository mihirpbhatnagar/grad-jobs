import type { SupabaseClient } from "@supabase/supabase-js";
import { chunks, selectAll } from "./db.ts";
import { companyKey, townKey } from "./normalise.ts";

// Home Office "Register of licensed sponsors: workers", published as a CSV on GOV.UK
// most weekdays. Sponsor status is information for the user, never a filter.

const PUBLICATION_API =
  "https://www.gov.uk/api/content/government/publications/register-of-licensed-sponsors-workers";

export type Sponsor = {
  name: string;
  name_key: string;
  town: string | null;
  county: string | null;
  ratings: string[];
  routes: string[];
};

export type SponsorMatch = { status: "likely" | "unclear" | "not_listed"; name: string | null };

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function latestRegisterUrl(): Promise<string> {
  const res = await fetch(PUBLICATION_API);
  if (!res.ok) throw new Error(`GOV.UK content API returned ${res.status}`);
  const page = (await res.json()) as { details: { attachments?: { url: string; content_type: string }[] } };
  const csv = page.details.attachments?.find((a) => a.content_type === "text/csv" || a.url.endsWith(".csv"));
  if (!csv) throw new Error("No CSV attachment found on the sponsor register page");
  return csv.url;
}

async function downloadRegister(url: string): Promise<Sponsor[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sponsor register download returned ${res.status}`);
  const [header, ...rows] = parseCsv(await res.text());
  if (header[0]?.trim() !== "Organisation Name") throw new Error(`Unexpected register columns: ${header.join(", ")}`);

  // One entry per organisation + town, collecting its licence ratings and routes.
  const byOrg = new Map<string, Sponsor>();
  for (const [rawName, rawTown, rawCounty, rawRating, rawRoute] of rows) {
    const name = rawName?.trim();
    if (!name) continue;
    const town = rawTown?.trim() || null;
    const id = `${name.toLowerCase()}|${(town ?? "").toLowerCase()}`;
    let entry = byOrg.get(id);
    if (!entry) {
      entry = { name, name_key: companyKey(name), town, county: rawCounty?.trim() || null, ratings: [], routes: [] };
      byOrg.set(id, entry);
    }
    const rating = rawRating?.trim();
    const route = rawRoute?.trim();
    if (rating && !entry.ratings.includes(rating)) entry.ratings.push(rating);
    if (route && !entry.routes.includes(route)) entry.routes.push(route);
  }
  return [...byOrg.values()];
}

// Refreshes the stored register when GOV.UK has published a new file; otherwise reuses it.
export async function refreshSponsors(db: SupabaseClient): Promise<{ sponsors: Sponsor[]; refreshed: boolean; url: string }> {
  const url = await latestRegisterUrl();
  const { data: setting } = await db.from("settings").select("value").eq("key", "sponsors.register_url").maybeSingle();

  if (setting?.value === url) {
    const sponsors = await selectAll<Sponsor>((from, to) =>
      db.from("sponsors").select("name,name_key,town,county,ratings,routes").order("id").range(from, to),
    );
    if (sponsors.length > 0) return { sponsors, refreshed: false, url };
  }

  const sponsors = await downloadRegister(url);
  const { error: delError } = await db.from("sponsors").delete().gt("id", 0);
  if (delError) throw delError;
  for (const batch of chunks(sponsors, 2000)) {
    const { error } = await db.from("sponsors").insert(batch);
    if (error) throw error;
  }
  const { error } = await db.from("settings").upsert({
    key: "sponsors.register_url",
    value: url,
    note: "Last sponsor register file loaded (set by the daily job).",
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return { sponsors, refreshed: true, url };
}

// Big graduate employers whose everyday name differs from their register entry
// (checked against the register on 26 October 2026). Keys are cleaned names.
const ALIASES: Record<string, string> = {
  ey: "Ernst & Young",
  "ernst and young": "Ernst & Young",
  pwc: "PricewaterhouseCoopers LLP",
  jlr: "Jaguar Land Rover Limited",
  "m and s": "Marks and Spencer Group Plc",
  "marks and spencer": "Marks and Spencer Group Plc",
  sky: "Sky UK Limited",
  barclays: "Barclays Bank UK PLC",
  lloyds: "Lloyds Bank plc",
  "lloyds banking group": "Lloyds Bank plc",
  unilever: "Unilever UK Limited",
  capgemini: "Capgemini UK PLC",
  atkinsrealis: "AtkinsRealis UK Limited",
  aon: "Aon UK  Limited",
  natwest: "NatWest Group PLC",
  "natwest group": "NatWest Group PLC",
  mazars: "Forvis Mazars LLP",
  wsp: "WSP Group Limited",
  bt: "BT Group",
  hsbc: "HSBC Holdings plc",
  "hsbc uk": "HSBC Holdings plc",
  ibm: "IBM UK Ltd",
};

// Exact cleaned-name match = Likely (a licence covers every site, so town only picks the
// best entry). A name that only matches as a prefix (e.g. "Barclays" vs "Barclays Bank UK")
// = Unclear. Otherwise Not listed.
export function sponsorMatcher(sponsors: Sponsor[]): (employer: string, location: string | null) => SponsorMatch {
  const exact = new Map<string, Sponsor[]>();
  const byFirstWord = new Map<string, string[]>();
  for (const s of sponsors) {
    if (!s.name_key) continue;
    if (!exact.has(s.name_key)) {
      exact.set(s.name_key, []);
      const first = s.name_key.split(" ")[0];
      byFirstWord.set(first, [...(byFirstWord.get(first) ?? []), s.name_key]);
    }
    exact.get(s.name_key)!.push(s);
  }

  return (employer, location) => {
    const key = companyKey(employer);
    if (!key) return { status: "not_listed", name: null };

    const hits = exact.get(key) ?? (ALIASES[key] ? exact.get(companyKey(ALIASES[key])) : undefined);
    if (hits) {
      const town = townKey(location);
      const best = hits.find((h) => town && townKey(h.town) === town) ?? hits[0];
      return { status: "likely", name: best.name };
    }

    // Prefix matches only for distinctive names, to avoid "Smith" matching "Smith Logistics".
    if (key.replace(/ /g, "").length >= 5) {
      const candidates = byFirstWord.get(key.split(" ")[0]) ?? [];
      const near = candidates.find((c) => c.startsWith(`${key} `) || key.startsWith(`${c} `));
      if (near) return { status: "unclear", name: exact.get(near)![0].name };
    }
    return { status: "not_listed", name: null };
  };
}

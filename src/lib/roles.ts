import { ukToday, weekAhead } from "./format";
import { companiesFor, type Company } from "./companies";
import { FIELDS } from "./profile";
import { publicClient } from "./supabase";

export type RoleTags = {
  degree: "First" | "2:1" | "2:2" | null;
  sponsorship: "not_offered" | "offered" | null;
  stages: string[];
  drivingLicence: boolean;
  startText: string | null;
  deadline: string | null;
  lengthMonths: number | null;
  graduateScheme: boolean;
  programmeTitle?: boolean;
  salaryCompetitive?: boolean;
  abroad?: string | null;
  aimedAt2027: boolean;
  startDate?: string | null;
};

export type Role = {
  id: number;
  title: string;
  employer: string;
  location: string | null;
  locations: string[];
  salary_min: number | null;
  salary_max: number | null;
  salary_text?: string | null;
  apply_url: string | null;
  posted_at: string | null;
  expires_at: string | null;
  tags: RoleTags;
  sponsor_status: "likely" | "unclear" | "not_listed" | null;
  sponsor_name: string | null;
  sources: string[];
  start_status: "confirmed" | "likely" | "unknown" | "before";
  company_key: string | null;
  description_length?: number;
};

export const ROLE_COLUMNS =
  "id,title,employer,location,locations,salary_min,salary_max,salary_text,apply_url,posted_at,expires_at,tags,sponsor_status,sponsor_name,sources,start_status,company_key";

export type RoleFilters = {
  q: string;
  sponsor: "" | "likely" | "unclear" | "not_listed";
  schemes: boolean;
  // "" = best match: the most complete, clearly-2027 listings first, within the other filters.
  sort: "" | "newest" | "closing";
  page: number;
  sectors: string[];
  locs: string[];
  salary: number;
  start: "" | "summer" | "sept" | "later";
  closingSoon: boolean;
  source: "" | "reed" | "google_jobs";
};

export const PAGE_SIZE = 30;

export type { Company };

// Number of filters switched on (shown on the Filters button).
export function activeFilterCount(f: RoleFilters): number {
  return f.sectors.length + f.locs.length + (f.salary ? 1 : 0) + (f.start ? 1 : 0) + (f.source ? 1 : 0) + (f.sponsor ? 1 : 0) + (f.schemes ? 1 : 0) + (f.closingSoon ? 1 : 0);
}

export function parseFilters(params: Record<string, string | string[] | undefined>): RoleFilters {
  const one = (k: string) => (Array.isArray(params[k]) ? params[k]![0] : params[k]) ?? "";
  const list = (k: string) => one(k).split(",").map((v) => v.trim()).filter(Boolean).slice(0, 15);
  const sponsor = one("sponsor");
  const start = one("start");
  const source = one("source");
  return {
    q: one("q").trim().slice(0, 100),
    sponsor: sponsor === "likely" || sponsor === "unclear" || sponsor === "not_listed" ? sponsor : "",
    schemes: one("schemes") === "1",
    sort: one("sort") === "closing" ? "closing" : one("sort") === "newest" ? "newest" : "",
    page: Math.max(1, Math.min(500, Number(one("page")) || 1)),
    sectors: list("sector").filter((id) => FIELDS.some((f) => f.id === id)),
    locs: list("loc").map((l) => l.replace(/[^\p{L} '-]/gu, "")).filter(Boolean),
    salary: Math.max(0, Math.min(200000, Number(one("salary")) || 0)),
    start: start === "summer" || start === "sept" || start === "later" ? start : "",
    closingSoon: one("closing") === "1",
    source: source === "reed" || source === "google_jobs" ? source : "",
  };
}

// Builds a query string for All roles with some filters changed (and back to page 1).
export function filtersToQuery(f: RoleFilters, changes: Partial<RoleFilters> = {}, path = "/"): string {
  const n = { ...f, page: 1, ...changes };
  const p = new URLSearchParams();
  if (n.q) p.set("q", n.q);
  if (n.sponsor) p.set("sponsor", n.sponsor);
  if (n.schemes) p.set("schemes", "1");
  if (n.sort) p.set("sort", n.sort);
  if (n.sectors.length) p.set("sector", n.sectors.join(","));
  if (n.locs.length) p.set("loc", n.locs.join(","));
  if (n.salary) p.set("salary", String(n.salary));
  if (n.start) p.set("start", n.start);
  if (n.closingSoon) p.set("closing", "1");
  if (n.source) p.set("source", n.source);
  if (n.page > 1) p.set("page", String(n.page));
  const qs = p.toString();
  return qs ? `${path}?${qs}` : path;
}

// Internships section (our users' rule): internships and work experience, no placements
// (already done); on-site only around Loughborough, Leicester, Nottingham and Derby; remote
// from anywhere; and events internships or ones with accommodation provided from anywhere.
export const NEARBY = ["Loughborough", "Leicester", "Nottingham", "Derby"];
// Works on any roles query (typed loosely: Supabase's query types are too deep to pass around).
export function internshipRules<Q>(query: Q): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (query as any).eq("kind", "internship");
  for (const word of ["placement", "year in industry", "sandwich", "industrial"]) q = q.not("title", "ilike", `%${word}%`);
  const where = [
    ...NEARBY.map((t) => `location.ilike.%${t}%`),
    "location.ilike.%remote%",
    "title.ilike.%remote%",
    "title.ilike.%event%",
    "description.ilike.%accommodation provided%",
    "description.ilike.%accommodation is provided%",
    "description.ilike.%accommodation included%",
  ];
  return q.or(where.join(","));
}

// Which list: the main list, or the separate internships / part-time sections.
export type RoleScope = "main" | "internships" | "part_time";

export async function fetchRoles(f: RoleFilters, scope: RoleScope = "main") {
  const db = publicClient();
  if (!db) return null;

  // Open roles whose closing date hasn't passed (the daily job also closes them each morning).
  const today = ukToday();
  let query = db.from("roles").select(ROLE_COLUMNS, { count: "exact" }).eq("is_open", true).or(`expires_at.is.null,expires_at.gte.${today}`).or(`tags->>deadline.is.null,tags->>deadline.gte.${today}`);
  // Main list: full-time jobs starting on or after the earliest start (June 2027), stated
  // or clearly aimed at 2027 starters. Part-time roles and internships have their own pages.
  if (scope === "main") {
    query = query.eq("kind", "job").eq("part_time", false).in("start_status", ["confirmed", "likely"]);
    // UK roles by default; "Abroad" in the location filter shows roles outside the UK instead.
    query = f.locs.includes("Abroad") ? query.not("tags->>abroad", "is", null) : query.is("tags->>abroad", null);
  } else if (scope === "internships") {
    query = internshipRules(query);
  } else {
    query = query.eq("part_time", true).neq("start_status", "before");
  }

  // Every word must appear in the title, company or place, exactly as typed (no word-stemming,
  // which made "marketing" match "Global Markets").
  for (const word of f.q.toLowerCase().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}&'-]/gu, "")).filter((w) => w.length >= 2).slice(0, 6)) {
    query = query.or(`title.ilike.%${word}%,employer.ilike.%${word}%,location.ilike.%${word}%`);
  }
  if (f.sponsor) query = query.eq("sponsor_status", f.sponsor);
  if (f.schemes) query = query.eq("tags->>graduateScheme", "true");
  if (f.sectors.length) {
    const words = FIELDS.filter((x) => f.sectors.includes(x.id)).flatMap((x) => x.keywords.map((k) => k.trim()));
    query = query.or(words.map((w) => `title.ilike.%${w}%`).join(","));
  }
  const places = f.locs.filter((l) => l !== "Abroad");
  if (places.length) query = query.or(places.map((l) => `location.ilike.%${l}%`).join(","));
  if (f.salary) query = query.or(`salary_min.gte.${f.salary},salary_max.gte.${f.salary}`);
  if (f.start === "summer") query = query.gte("tags->>startDate", "2027-06-01").lt("tags->>startDate", "2027-09-01");
  if (f.start === "sept") query = query.gte("tags->>startDate", "2027-09-01").lt("tags->>startDate", "2027-10-01");
  if (f.start === "later") query = query.gte("tags->>startDate", "2027-10-01");
  if (f.closingSoon) {
    // Closing this week: the listing's own deadline or the board's expiry within 7 days.
    const week = weekAhead();
    query = query.or(`expires_at.lte.${week},tags->>deadline.lte.${week}`);
  }
  if (f.source) query = query.contains("sources", [f.source]);
  if (f.sort === "closing") query = query.order("expires_at", { ascending: true, nullsFirst: false });
  else if (f.sort === "newest") query = query.order("posted_at", { ascending: false, nullsFirst: false });
  else query = query.order("quality", { ascending: false }).order("posted_at", { ascending: false, nullsFirst: false });

  const from = (f.page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.order("id", { ascending: false }).range(from, from + PAGE_SIZE - 1);
  if (error) throw error;

  const { data: latest } = await db.from("roles").select("last_seen").order("last_seen", { ascending: false }).limit(1);
  const roles = (data ?? []) as Role[];
  const companies = await companiesFor(roles.map((r) => r.company_key));
  return { roles, companies, total: count ?? 0, updatedAt: latest?.[0]?.last_seen as string | undefined };
}

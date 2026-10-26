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
  aimedAt2027: boolean;
};

export type Role = {
  id: number;
  title: string;
  employer: string;
  location: string | null;
  locations: string[];
  salary_min: number | null;
  salary_max: number | null;
  apply_url: string | null;
  posted_at: string | null;
  expires_at: string | null;
  tags: RoleTags;
  sponsor_status: "likely" | "unclear" | "not_listed" | null;
  sponsor_name: string | null;
  sources: string[];
  start_status: "confirmed" | "likely";
};

export type RoleFilters = {
  q: string;
  sponsor: "" | "likely" | "unclear" | "not_listed";
  schemes: boolean;
  sort: "newest" | "closing";
  page: number;
  sectors: string[];
  locs: string[];
  salary: number;
  start: "" | "summer" | "sept" | "later" | "unstated";
  closingSoon: boolean;
  source: "" | "reed" | "google_jobs";
};

export const PAGE_SIZE = 40;

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
    sort: one("sort") === "closing" ? "closing" : "newest",
    page: Math.max(1, Math.min(500, Number(one("page")) || 1)),
    sectors: list("sector").filter((id) => FIELDS.some((f) => f.id === id)),
    locs: list("loc").map((l) => l.replace(/[^\p{L} '-]/gu, "")).filter(Boolean),
    salary: Math.max(0, Math.min(200000, Number(one("salary")) || 0)),
    start: start === "summer" || start === "sept" || start === "later" || start === "unstated" ? start : "",
    closingSoon: one("closing") === "1",
    source: source === "reed" || source === "google_jobs" ? source : "",
  };
}

// Builds a query string for All roles with some filters changed (and back to page 1).
export function filtersToQuery(f: RoleFilters, changes: Partial<RoleFilters> = {}): string {
  const n = { ...f, page: 1, ...changes };
  const p = new URLSearchParams();
  if (n.q) p.set("q", n.q);
  if (n.sponsor) p.set("sponsor", n.sponsor);
  if (n.schemes) p.set("schemes", "1");
  if (n.sort !== "newest") p.set("sort", n.sort);
  if (n.sectors.length) p.set("sector", n.sectors.join(","));
  if (n.locs.length) p.set("loc", n.locs.join(","));
  if (n.salary) p.set("salary", String(n.salary));
  if (n.start) p.set("start", n.start);
  if (n.closingSoon) p.set("closing", "1");
  if (n.source) p.set("source", n.source);
  if (n.page > 1) p.set("page", String(n.page));
  const qs = p.toString();
  return qs ? `/?${qs}` : "/";
}

export async function fetchRoles(f: RoleFilters) {
  const db = publicClient();
  if (!db) return null;

  let query = db
    .from("roles")
    .select(
      "id,title,employer,location,locations,salary_min,salary_max,apply_url,posted_at,expires_at,tags,sponsor_status,sponsor_name,sources,start_status",
      { count: "exact" },
    )
    // Main list: full-time jobs starting on or after the earliest start (June 2027), stated
    // or clearly aimed at 2027 starters. Part-time roles, internships and apprenticeships are
    // stored for their own sections later.
    .eq("is_open", true)
    .eq("kind", "job")
    .eq("part_time", false)
    .in("start_status", f.start === "unstated" ? ["unknown"] : ["confirmed", "likely"]);

  if (f.q) query = query.textSearch("search", f.q, { type: "websearch", config: "english" });
  if (f.sponsor) query = query.eq("sponsor_status", f.sponsor);
  if (f.schemes) query = query.eq("tags->>graduateScheme", "true");
  if (f.sectors.length) {
    const words = FIELDS.filter((x) => f.sectors.includes(x.id)).flatMap((x) => x.keywords.map((k) => k.trim()));
    query = query.or(words.map((w) => `title.ilike.%${w}%`).join(","));
  }
  if (f.locs.length) query = query.or(f.locs.map((l) => `location.ilike.%${l}%`).join(","));
  if (f.salary) query = query.or(`salary_min.gte.${f.salary},salary_max.gte.${f.salary}`);
  if (f.start === "summer") query = query.gte("tags->>startDate", "2027-06-01").lt("tags->>startDate", "2027-09-01");
  if (f.start === "sept") query = query.gte("tags->>startDate", "2027-09-01").lt("tags->>startDate", "2027-10-01");
  if (f.start === "later") query = query.gte("tags->>startDate", "2027-10-01");
  if (f.closingSoon) {
    const twoWeeks = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    query = query.lte("expires_at", twoWeeks);
  }
  if (f.source) query = query.contains("sources", [f.source]);
  query =
    f.sort === "closing"
      ? query.order("expires_at", { ascending: true, nullsFirst: false })
      : query.order("posted_at", { ascending: false, nullsFirst: false });

  const from = (f.page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.order("id", { ascending: false }).range(from, from + PAGE_SIZE - 1);
  if (error) throw error;

  const { data: latest } = await db.from("roles").select("last_seen").order("last_seen", { ascending: false }).limit(1);
  return { roles: (data ?? []) as Role[], total: count ?? 0, updatedAt: latest?.[0]?.last_seen as string | undefined };
}

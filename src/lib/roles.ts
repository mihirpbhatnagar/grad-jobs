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
};

export const PAGE_SIZE = 40;

export function parseFilters(params: Record<string, string | string[] | undefined>): RoleFilters {
  const one = (k: string) => (Array.isArray(params[k]) ? params[k]![0] : params[k]) ?? "";
  const sponsor = one("sponsor");
  return {
    q: one("q").trim().slice(0, 100),
    sponsor: sponsor === "likely" || sponsor === "unclear" || sponsor === "not_listed" ? sponsor : "",
    schemes: one("schemes") === "1",
    sort: one("sort") === "closing" ? "closing" : "newest",
    page: Math.max(1, Math.min(500, Number(one("page")) || 1)),
  };
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
    .in("start_status", ["confirmed", "likely"]);

  if (f.q) query = query.textSearch("search", f.q, { type: "websearch", config: "english" });
  if (f.sponsor) query = query.eq("sponsor_status", f.sponsor);
  if (f.schemes) query = query.eq("tags->>graduateScheme", "true");
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

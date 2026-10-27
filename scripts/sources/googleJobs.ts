import { requireEnv } from "../lib/env.ts";
import { employerFromTitle, isBoardName } from "../lib/tags.ts";
import type { Listing } from "./types.ts";

// Google Jobs results via DataForSEO (prepaid, pay per search page of 10 results).
// Docs: https://docs.dataforseo.com/v3/serp/google/jobs/task_post/
// Google Jobs gives title, employer, location and the original posting's link, but no
// description, so these listings are matched to known roles by employer and title.

const API = "https://api.dataforseo.com/v3/serp/google/jobs";
const UK = 2826;

export const GOOGLE_JOBS_QUERIES = [
  "graduate scheme 2027",
  "graduate programme 2027",
  "graduate scheme",
  "graduate jobs",
  "graduate trainee",
  "entry level graduate",
  "graduate marketing",
  "graduate sales",
  "graduate consultant",
  "graduate finance",
  "graduate analyst",
  "graduate operations",
  "graduate project manager",
  "graduate HR",
  "graduate data analyst",
  "graduate software",
  "graduate engineer",
  "graduate communications",
  "graduate events",
  "graduate sports",
  "events internship",
  "internship",
];

// One-off deep sweep (run by hand with --google-sweep): every field, internships and the main
// cities, to measure and fill coverage, including roles Google shows "via LinkedIn".
const FIELD_WORDS = ["marketing", "sales", "consulting", "finance", "accounting", "audit", "tax", "banking", "investment", "operations", "supply chain", "procurement", "project management", "HR", "data", "analyst", "software", "technology", "cyber security", "engineering", "civil engineering", "mechanical engineering", "communications", "PR", "media", "events", "hospitality", "retail", "buying", "FMCG", "policy", "public sector", "sports", "law", "property", "insurance", "actuarial", "logistics", "business development", "management trainee"];
const CITIES = ["London", "Manchester", "Birmingham", "Leeds", "Bristol", "Edinburgh", "Glasgow", "Nottingham", "Leicester", "Sheffield", "Newcastle", "Cardiff", "Reading", "Cambridge"];
export const SWEEP_QUERIES = [
  ...FIELD_WORDS.map((w) => `graduate ${w} 2027`),
  ...FIELD_WORDS.map((w) => `${w} graduate scheme`),
  ...CITIES.map((c) => `graduate scheme ${c}`),
  ...["internship", "summer internship 2027", "events internship", "work experience", "graduate programme 2027", "2027 graduate intake", "september 2027 graduate", "graduate trainee", "entry level graduate", "graduate rotational programme"],
];

// A second, different sweep: fields by city and internships by field.
export const SWEEP_QUERIES_2 = [
  ...["marketing", "finance", "consulting", "data", "engineering", "sales", "HR", "operations", "technology", "project management"].flatMap((w) =>
    ["London", "Manchester", "Birmingham", "Leeds", "Bristol", "Nottingham"].map((c) => `graduate ${w} ${c}`),
  ),
  ...["marketing", "finance", "events", "sports", "data", "HR", "sales", "media"].map((w) => `${w} internship`),
];

type Task = { id: string; status_code: number; status_message: string; cost: number };
type JobItem = {
  type: string;
  job_id: string;
  title: string;
  employer_name: string | null;
  location: string | null;
  source_name: string | null;
  source_url: string | null;
  salary: string | null;
  contract_type: string | null;
  timestamp: string | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(path: string, body?: unknown): Promise<T> {
  const auth = Buffer.from(`${requireEnv("DATAFORSEO_LOGIN")}:${requireEnv("DATAFORSEO_PASSWORD")}`).toString("base64");
  let res: Response | undefined;
  for (let attempt = 1; !res; attempt++) {
    try {
      res = await fetch(`${API}${path}`, {
        method: body ? "POST" : "GET",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      // Network blip: wait and retry rather than losing tasks already paid for.
      if (attempt >= 6) throw err;
      await sleep(10_000 * attempt);
    }
  }
  if (!res.ok) throw new Error(`DataForSEO ${path} returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { status_code: number; status_message: string };
  if (json.status_code !== 20000) throw new Error(`DataForSEO: ${json.status_message}`);
  return json as T;
}

// Rough salary parsing ("£28,000–£32,000 a year"); hourly or unclear amounts are left out.
function parseSalary(text: string | null): { min: number | null; max: number | null } {
  if (!text || !/year|annum|£\d{2},?\d{3}/i.test(text) || /hour|day|week|month/i.test(text)) return { min: null, max: null };
  const nums = [...text.matchAll(/£\s?(\d+(?:[.,]\d+)?)\s?(k|K)?/g)].map((m) => {
    const n = Number(m[1].replace(/,/g, ""));
    return m[2] ? n * 1000 : n;
  });
  return { min: nums[0] ?? null, max: nums[1] ?? nums[0] ?? null };
}

export async function searchGoogleJobs(
  queries: string[],
  depth: number,
  maxCostUsd: number,
): Promise<{ listings: Listing[]; costUsd: number; tasks: number }> {
  let costUsd = 0;
  const ids: string[] = [];
  for (const keyword of queries) {
    if (costUsd >= maxCostUsd) break;
    const res = await call<{ tasks: Task[] }>("/task_post", [{ keyword, location_code: UK, language_code: "en", depth }]);
    for (const t of res.tasks) {
      costUsd += t.cost ?? 0;
      if (t.status_code === 20100) ids.push(t.id);
      else console.warn(`Google Jobs task for "${keyword}" not created: ${t.status_message}`);
    }
  }

  return { ...(await collect(ids)), costUsd, tasks: ids.length };
}

// Re-downloads (free) the results of searches already paid for in a time window, e.g. when a
// run lost its connection while saving. Uses DataForSEO's list of past task ids.
export async function recoverGoogleJobs(fromIso: string, toIso: string): Promise<Listing[]> {
  const auth = Buffer.from(`${requireEnv("DATAFORSEO_LOGIN")}:${requireEnv("DATAFORSEO_PASSWORD")}`).toString("base64");
  const res = await fetch("https://api.dataforseo.com/v3/serp/id_list", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    // The end must be in the past: cap it at a minute ago.
    body: JSON.stringify([{ datetime_from: fromIso, datetime_to: new Date(Math.min(Date.parse(toIso), Date.now() - 60_000)).toISOString().replace("T", " ").slice(0, 19) + " +00:00", limit: 1000 }]),
  });
  const json = (await res.json()) as { tasks?: { result?: { id: string; url?: string }[] }[] };
  const ids = (json.tasks?.[0]?.result ?? []).filter((r) => !r.url || r.url.includes("/jobs/")).map((r) => r.id);
  console.log(`Recovering ${ids.length} Google Jobs searches`);
  return (await collect(ids)).listings;
}

// Fetches finished tasks' results and turns them into listings.
async function collect(ids: string[]): Promise<{ listings: Listing[] }> {
  // Standard-queue tasks usually finish within a few minutes.
  const pending = new Set(ids);
  const items: JobItem[] = [];
  const deadline = Date.now() + 20 * 60_000;
  while (pending.size > 0 && Date.now() < deadline) {
    await sleep(20_000);
    // Ask for each task's results directly; a task still queued answers with a non-20000 status.
    for (const id of [...pending]) {
      const got = await call<{ tasks: { status_code: number; result: { items: JobItem[] | null }[] | null }[] }>(`/task_get/advanced/${id}`);
      const task = got.tasks[0];
      if (task?.status_code !== 20000) continue;
      pending.delete(id);
      for (const r of task.result ?? []) items.push(...(r.items ?? []).filter((i) => i.type === "google_jobs_item"));
    }
  }
  if (pending.size > 0) console.warn(`${pending.size} Google Jobs tasks were not ready in time`);

  const byId = new Map<string, Listing>();
  for (const i of items) {
    if (!i.employer_name || !i.title || byId.has(i.job_id)) continue;
    const pay = parseSalary(i.salary);
    byId.set(i.job_id, {
      source: "google_jobs",
      sourceId: i.job_id,
      sourceUrl: i.source_url,
      title: i.title.trim(),
      employer: isBoardName(i.employer_name) ? (employerFromTitle(i.title) ?? i.employer_name.trim()) : i.employer_name.trim(),
      location: i.location?.replace(/\s*\(\+\d+ others?\)/i, "").replace(/,?\s*(UK|United Kingdom)$/i, "").trim() || null,
      salaryMin: pay.min,
      salaryMax: pay.max,
      salaryText: i.salary,
      contractType: i.contract_type,
      fullTime: i.contract_type ? /full/i.test(i.contract_type) : null,
      partTime: /part/i.test(i.contract_type ?? "") || /\bpart[- ]time\b/i.test(i.title),
      description: "",
      applyUrl: i.source_url,
      postedAt: i.timestamp?.slice(0, 10) ?? null,
      expiresAt: null,
      via: i.source_name,
    });
  }
  return { listings: [...byId.values()] };
}

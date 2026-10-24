import { requireEnv } from "../lib/env.ts";
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
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`DataForSEO ${path} returned ${res.status}`);
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

  // Standard-queue tasks usually finish within a few minutes.
  const pending = new Set(ids);
  const items: JobItem[] = [];
  const deadline = Date.now() + 20 * 60_000;
  while (pending.size > 0 && Date.now() < deadline) {
    await sleep(20_000);
    const ready = await call<{ tasks: { result: { id: string }[] | null }[] }>("/tasks_ready");
    for (const { id } of ready.tasks.flatMap((t) => t.result ?? [])) {
      if (!pending.delete(id)) continue;
      const got = await call<{ tasks: { result: { items: JobItem[] | null }[] | null }[] }>(`/task_get/advanced/${id}`);
      for (const r of got.tasks[0]?.result ?? []) items.push(...(r.items ?? []).filter((i) => i.type === "google_jobs_item"));
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
      employer: i.employer_name.trim(),
      location: i.location?.replace(/,?\s*(UK|United Kingdom)$/i, "").trim() || null,
      salaryMin: pay.min,
      salaryMax: pay.max,
      salaryText: i.salary,
      contractType: i.contract_type,
      fullTime: i.contract_type ? /full/i.test(i.contract_type) : null,
      description: "",
      applyUrl: i.source_url,
      postedAt: i.timestamp?.slice(0, 10) ?? null,
      expiresAt: null,
    });
  }
  return { listings: [...byId.values()], costUsd, tasks: ids.length };
}

import { requireEnv } from "../lib/env.ts";
import { htmlToText, prettyLocation } from "../lib/normalise.ts";
import type { Listing } from "./types.ts";

// Reed jobseeker API (free key). Docs: https://www.reed.co.uk/developers/jobseeker
// Low-volume use: one search sweep a day, then details only for jobs we haven't seen.

const API = "https://www.reed.co.uk/api/1.0";
const PAGE_SIZE = 100;

// Graduate flag first, then wording aimed at 2027 graduate intakes. (Broad "entry level"
// searches were dropped: they return start-now hiring, not 2027 starts.)
const SEARCHES: Record<string, string>[] = [
  { graduate: "true" },
  { keywords: "graduate" },
  { keywords: "graduate scheme" },
  { keywords: "graduate programme" },
  { keywords: "2027 graduate" },
  { keywords: "september 2027" },
  { keywords: "2027 intake" },
  { keywords: "final year students" },
  // Internships and short work experience (their own section, not the main list).
  { keywords: "internship" },
  { keywords: "work experience" },
  { keywords: "events internship" },
];

type SearchResult = {
  jobId: number;
  employerName: string;
  jobTitle: string;
  locationName: string | null;
  minimumSalary: number | null;
  maximumSalary: number | null;
  expirationDate: string | null;
  date: string | null;
  jobDescription: string | null;
  jobUrl: string;
};

type JobDetails = {
  jobId: number;
  yearlyMinimumSalary: number | null;
  yearlyMaximumSalary: number | null;
  salary: string | null;
  datePosted: string | null;
  expirationDate: string | null;
  externalUrl: string | null;
  jobUrl: string;
  fullTime: boolean | null;
  partTime: boolean | null;
  contractType: string | null;
  jobDescription: string | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Reed caps requests per hour. When the cap is hit, details fetching pauses until the hour
// resets (at most MAX_HOURLY_WAITS times per run); anything still missing is retried next run.
class HourlyLimitError extends Error {}
const HOURLY_WAIT_MS = 61 * 60_000;
const MAX_HOURLY_WAITS = Number(process.env.REED_MAX_HOURLY_WAITS ?? 6);
let hourlyWaits = 0;
let resumeAt = 0;

async function reedGet<T>(path: string): Promise<T> {
  const auth = `Basic ${Buffer.from(`${requireEnv("REED_API_KEY")}:`).toString("base64")}`;
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${API}${path}`, { headers: { Authorization: auth } });
    } catch (err) {
      // Network blip (e.g. Wi-Fi drop): wait and retry rather than failing the run.
      if (attempt >= 6) throw err;
      await sleep(10_000 * attempt);
      continue;
    }
    if (res.ok) return (await res.json()) as T;
    if (res.status === 403 && /per-hour request limit/i.test(await res.text())) {
      if (Date.now() >= resumeAt) {
        if (hourlyWaits >= MAX_HOURLY_WAITS) throw new HourlyLimitError();
        hourlyWaits++;
        resumeAt = Date.now() + HOURLY_WAIT_MS;
        console.log(`  Reed hourly limit reached; pausing until ${new Date(resumeAt).toTimeString().slice(0, 5)}`);
      }
      await sleep(resumeAt - Date.now());
      attempt--;
      continue;
    }
    if (attempt >= 6 || (res.status !== 429 && res.status < 500)) {
      throw new Error(`Reed ${path} returned ${res.status}`);
    }
    // 429 = Reed asking us to slow down: wait properly before trying again.
    await sleep(res.status === 429 ? 15_000 * attempt : 2000 * attempt);
  }
}

// Reed dates are dd/mm/yyyy.
function reedDate(value: string | null | undefined): string | null {
  const m = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export async function searchReed(): Promise<{ results: Map<number, SearchResult>; calls: number }> {
  const results = new Map<number, SearchResult>();
  let calls = 0;
  for (const search of SEARCHES) {
    // Broad words ("work experience") match tens of thousands of jobs and Reed fails deep into
    // them, so each search stops after 2,000 results; a failed page ends that search only.
    for (let skip = 0; skip < 2000; skip += PAGE_SIZE) {
      const params = new URLSearchParams({ ...search, resultsToTake: String(PAGE_SIZE), resultsToSkip: String(skip) });
      let page: { results: SearchResult[]; totalResults: number };
      try {
        page = await reedGet<{ results: SearchResult[]; totalResults: number }>(`/search?${params}`);
      } catch (err) {
        console.warn(`Reed search ${JSON.stringify(search)} stopped at ${skip}: ${String(err).slice(0, 120)}`);
        break;
      }
      calls++;
      for (const r of page.results) results.set(r.jobId, r);
      if (page.results.length < PAGE_SIZE || skip + PAGE_SIZE >= page.totalResults) break;
      await sleep(150);
    }
  }
  return { results, calls };
}

export async function reedDetails(ids: number[], concurrency = 2): Promise<Map<number, JobDetails>> {
  const details = new Map<number, JobDetails>();
  let next = 0;
  async function worker() {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        details.set(id, await reedGet<JobDetails>(`/jobs/${id}`));
      } catch (err) {
        // Out of hourly allowance for this run: stop; the rest is fetched next run.
        if (err instanceof HourlyLimitError) next = ids.length;
        else console.warn(`Reed details failed for ${id}: ${(err as Error).message}`);
      }
      await sleep(250);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return details;
}

export function toListing(r: SearchResult, d: JobDetails | undefined): Listing {
  return {
    source: "reed",
    sourceId: String(r.jobId),
    sourceUrl: r.jobUrl,
    title: r.jobTitle.trim(),
    employer: r.employerName.trim(),
    location: prettyLocation(r.locationName),
    salaryMin: d?.yearlyMinimumSalary ?? r.minimumSalary ?? null,
    salaryMax: d?.yearlyMaximumSalary ?? r.maximumSalary ?? null,
    salaryText: d?.salary ?? null,
    contractType: d?.contractType ?? null,
    fullTime: d?.fullTime ?? null,
    partTime: d?.partTime === true || /\bpart[- ]time\b/i.test(r.jobTitle),
    description: htmlToText(d?.jobDescription ?? r.jobDescription),
    applyUrl: d?.externalUrl || r.jobUrl,
    postedAt: reedDate(d?.datePosted ?? r.date),
    expiresAt: reedDate(d?.expirationDate ?? r.expirationDate),
  };
}

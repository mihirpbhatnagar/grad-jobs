import { requireEnv } from "../lib/env.ts";
import { htmlToText } from "../lib/normalise.ts";
import type { Listing } from "./types.ts";

// Reed jobseeker API (free key). Docs: https://www.reed.co.uk/developers/jobseeker
// Low-volume use: one search sweep a day, then details only for jobs we haven't seen.

const API = "https://www.reed.co.uk/api/1.0";
const PAGE_SIZE = 100;

// Graduate flag first, then wording that catches grad roles Reed doesn't flag.
const SEARCHES: Record<string, string>[] = [
  { graduate: "true" },
  { keywords: "graduate" },
  { keywords: "graduate scheme" },
  { keywords: "graduate programme" },
  { keywords: "entry level" },
  { keywords: "2027" },
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
  contractType: string | null;
  jobDescription: string | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function reedGet<T>(path: string): Promise<T> {
  const auth = `Basic ${Buffer.from(`${requireEnv("REED_API_KEY")}:`).toString("base64")}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}${path}`, { headers: { Authorization: auth } });
    if (res.ok) return (await res.json()) as T;
    if (attempt >= 4 || (res.status !== 429 && res.status < 500)) {
      throw new Error(`Reed ${path} returned ${res.status}`);
    }
    await sleep(2000 * attempt);
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
    for (let skip = 0; ; skip += PAGE_SIZE) {
      const params = new URLSearchParams({ ...search, resultsToTake: String(PAGE_SIZE), resultsToSkip: String(skip) });
      const page = await reedGet<{ results: SearchResult[]; totalResults: number }>(`/search?${params}`);
      calls++;
      for (const r of page.results) results.set(r.jobId, r);
      if (page.results.length < PAGE_SIZE || skip + PAGE_SIZE >= page.totalResults) break;
      await sleep(150);
    }
  }
  return { results, calls };
}

export async function reedDetails(ids: number[], concurrency = 4): Promise<Map<number, JobDetails>> {
  const details = new Map<number, JobDetails>();
  let next = 0;
  async function worker() {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        details.set(id, await reedGet<JobDetails>(`/jobs/${id}`));
      } catch (err) {
        console.warn(`Reed details failed for ${id}: ${(err as Error).message}`);
      }
      await sleep(120);
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
    location: r.locationName?.trim() || null,
    salaryMin: d?.yearlyMinimumSalary ?? r.minimumSalary ?? null,
    salaryMax: d?.yearlyMaximumSalary ?? r.maximumSalary ?? null,
    salaryText: d?.salary ?? null,
    contractType: d?.contractType ?? null,
    fullTime: d?.fullTime ?? null,
    description: htmlToText(d?.jobDescription ?? r.jobDescription),
    applyUrl: d?.externalUrl || r.jobUrl,
    postedAt: reedDate(d?.datePosted ?? r.date),
    expiresAt: reedDate(d?.expirationDate ?? r.expirationDate),
  };
}

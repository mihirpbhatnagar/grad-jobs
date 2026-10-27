import { USER_AGENT, readJobPage } from "../lib/employerPages.ts";
import { htmlToText, prettyLocation } from "../lib/normalise.ts";
import type { Listing } from "./types.ts";

// Employers' own hiring systems, read through their public job-board feeds (the same data
// their careers pages show). Only UK early-career roles are kept. Low volume: one request per
// employer per run, plus one per new graduate role where a feed needs a details call.

export type Feed = { ats: string; ats_id: string; name: string };

const EARLY = /\b(graduate|grad|graduates|trainee|entry[- ]level|early careers?|intern|internship|placement|industrial placement|summer analyst|spring week|insight|apprentice|apprenticeship|2027|junior|new grad|campus|futures?|undergraduate|year in industry)\b/i;
const SENIOR = /\b(senior|snr|sr\.?|principal|head of|director|vp|vice president|chief|lead|manager|partner|staff|experienced)\b/i;
const UK = /\b(uk|u\.k\.|united kingdom|great britain|england|scotland|wales|northern ireland|london|manchester|birmingham|leeds|glasgow|edinburgh|bristol|cardiff|belfast|liverpool|newcastle|sheffield|nottingham|leicester|cambridge|oxford|reading|milton keynes|southampton|aberdeen|coventry|derby|warrington|york|brighton|guildford|farnborough|bath|exeter|plymouth|norwich|ipswich|swindon|slough|stevenage|crawley|chester|preston|lancaster|loughborough|cheltenham|gloucester|barrow|warton|portsmouth|basingstoke|bracknell|uxbridge|watford|hatfield|luton|peterborough|northampton|telford|wolverhampton|hull|dundee|inverness|swansea|newport|remote - uk|gb)\b/i;

export const wantedTitle = (title: string) => EARLY.test(title) && !(SENIOR.test(title) && !/\b(graduate|grad|intern|trainee|placement)\b/i.test(title));
export const inUk = (location: string | null | undefined) => !!location && UK.test(location);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function json<T>(url: string, init?: RequestInit): Promise<T | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
        signal: AbortSignal.timeout(25_000),
      });
      if (res.status === 404 || res.status === 403 || res.status === 401 || res.status === 400) return null;
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as T;
    } catch {
      if (attempt === 3) return null;
      await sleep(2000 * attempt);
    }
  }
  return null;
}

function listing(feed: Feed, id: string, f: Partial<Listing> & { title: string; url: string }): Listing {
  return {
    source: "employer",
    sourceId: `${feed.ats}:${feed.ats_id}:${id}`,
    sourceUrl: f.url,
    title: f.title.trim(),
    employer: feed.name,
    location: prettyLocation(f.location ?? null),
    salaryMin: f.salaryMin ?? null,
    salaryMax: f.salaryMax ?? null,
    salaryText: null,
    contractType: f.contractType ?? null,
    fullTime: f.contractType ? /full/i.test(f.contractType) : null,
    partTime: /part[- ]time/i.test(`${f.contractType ?? ""} ${f.title}`),
    description: f.description ?? "",
    applyUrl: f.url,
    postedAt: f.postedAt?.slice(0, 10) ?? null,
    expiresAt: f.expiresAt ?? null,
  };
}

// ---- one reader per hiring system ----

async function greenhouse(feed: Feed): Promise<Listing[] | null> {
  type J = { id: number; title: string; location?: { name?: string }; absolute_url: string; content?: string; updated_at?: string; first_published?: string };
  const res = await json<{ jobs: J[] }>(`https://boards-api.greenhouse.io/v1/boards/${feed.ats_id}/jobs?content=true`);
  if (!res) return null;
  return res.jobs
    .filter((j) => wantedTitle(j.title) && inUk(j.location?.name))
    .map((j) =>
      listing(feed, String(j.id), {
        title: j.title,
        url: j.absolute_url,
        location: j.location?.name ?? null,
        description: htmlToText((j.content ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&")),
        postedAt: j.first_published ?? j.updated_at ?? null,
      }),
    );
}

async function lever(feed: Feed): Promise<Listing[] | null> {
  type J = { id: string; text: string; hostedUrl: string; categories?: { location?: string; commitment?: string; allLocations?: string[] }; descriptionPlain?: string; additionalPlain?: string; lists?: { text: string; content: string }[]; createdAt?: number };
  let res = await json<J[]>(`https://api.lever.co/v0/postings/${feed.ats_id}?mode=json`);
  if (!res) res = await json<J[]>(`https://api.eu.lever.co/v0/postings/${feed.ats_id}?mode=json`);
  if (!res || !Array.isArray(res)) return null;
  return res
    .filter((j) => wantedTitle(j.text) && inUk([j.categories?.location, ...(j.categories?.allLocations ?? [])].join(" ")))
    .map((j) =>
      listing(feed, j.id, {
        title: j.text,
        url: j.hostedUrl,
        location: j.categories?.location ?? null,
        contractType: j.categories?.commitment ?? null,
        description: [j.descriptionPlain, ...(j.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`), j.additionalPlain].filter(Boolean).join("\n\n"),
        postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
      }),
    );
}

async function ashby(feed: Feed): Promise<Listing[] | null> {
  type J = { id: string; title: string; location?: string; secondaryLocations?: { location: string }[]; jobUrl: string; descriptionPlain?: string; publishedAt?: string; employmentType?: string; isListed?: boolean };
  const res = await json<{ jobs: J[] }>(`https://api.ashbyhq.com/posting-api/job-board/${feed.ats_id}`);
  if (!res) return null;
  return res.jobs
    .filter((j) => j.isListed !== false && wantedTitle(j.title) && inUk([j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)].join(" ")))
    .map((j) => listing(feed, j.id, { title: j.title, url: j.jobUrl, location: j.location ?? null, description: j.descriptionPlain ?? "", postedAt: j.publishedAt ?? null, contractType: j.employmentType ?? null }));
}

async function smartrecruiters(feed: Feed): Promise<Listing[] | null> {
  type P = { id: string; name: string; releasedDate?: string; location?: { city?: string; country?: string; fullLocation?: string }; typeOfEmployment?: { label?: string } };
  const out: Listing[] = [];
  let seenAny = false;
  for (const q of ["graduate", "intern", "placement", "trainee", "early careers"]) {
    const res = await json<{ content: P[]; totalFound: number }>(`https://api.smartrecruiters.com/v1/companies/${feed.ats_id}/postings?limit=100&country=gb&q=${encodeURIComponent(q)}`);
    if (!res) continue;
    seenAny = true;
    for (const p of res.content) {
      if (!wantedTitle(p.name) || out.some((o) => o.sourceId.endsWith(`:${p.id}`))) continue;
      const d = await json<{ jobAd?: { sections?: Record<string, { title?: string; text?: string }> }; postingUrl?: string; applyUrl?: string }>(
        `https://api.smartrecruiters.com/v1/companies/${feed.ats_id}/postings/${p.id}`,
      );
      const sections = Object.values(d?.jobAd?.sections ?? {});
      out.push(
        listing(feed, p.id, {
          title: p.name,
          url: d?.postingUrl ?? `https://jobs.smartrecruiters.com/${feed.ats_id}/${p.id}`,
          location: p.location?.fullLocation ?? p.location?.city ?? "United Kingdom",
          contractType: p.typeOfEmployment?.label ?? null,
          description: sections.map((s) => `${s.title ?? ""}\n${htmlToText(s.text ?? "")}`).join("\n\n"),
          postedAt: p.releasedDate ?? null,
        }),
      );
      await sleep(300);
    }
  }
  return seenAny ? out : null;
}

async function workable(feed: Feed): Promise<Listing[] | null> {
  type J = { title: string; shortcode: string; country?: string; city?: string; url: string; description?: string; published_on?: string; employment_type?: string };
  const res = await json<{ jobs: J[] }>(`https://apply.workable.com/api/v1/widget/accounts/${feed.ats_id}?details=true`);
  if (!res) return null;
  return res.jobs
    .filter((j) => wantedTitle(j.title) && inUk(`${j.city ?? ""} ${j.country ?? ""}`))
    .map((j) => listing(feed, j.shortcode, { title: j.title, url: j.url, location: j.city ?? j.country ?? null, description: htmlToText(j.description ?? ""), postedAt: j.published_on ?? null, contractType: j.employment_type ?? null }));
}

// Workday: ats_id is "host/tenant/site", e.g. "baesystems.wd3.myworkdayjobs.com/baesystems/External".
async function workday(feed: Feed): Promise<Listing[] | null> {
  const [host, tenant, site] = feed.ats_id.split("/");
  const base = `https://${host}/wday/cxs/${tenant}/${site}`;
  type P = { title: string; externalPath: string; locationsText?: string; postedOn?: string };
  const found = new Map<string, P>();
  let reachable = false;
  for (const searchText of ["graduate", "intern", "placement", "trainee", "early careers", "2027"]) {
    for (let offset = 0; offset < 100; offset += 20) {
      const res = await json<{ total: number; jobPostings: P[] }>(`${base}/jobs`, { method: "POST", body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText }) });
      if (!res) break;
      reachable = true;
      for (const p of res.jobPostings ?? []) if (wantedTitle(p.title)) found.set(p.externalPath, p);
      if ((res.jobPostings ?? []).length < 20) break;
      await sleep(400);
    }
  }
  if (!reachable) return null;
  const out: Listing[] = [];
  for (const p of found.values()) {
    type D = { jobPostingInfo?: { jobDescription?: string; location?: string; additionalLocations?: string[]; country?: { descriptor?: string }; timeType?: string; externalUrl?: string; startDate?: string; endDate?: string; jobReqId?: string } };
    const d = await json<D>(`${base}${p.externalPath}`);
    const info = d?.jobPostingInfo;
    const where = [info?.location, ...(info?.additionalLocations ?? []), info?.country?.descriptor, p.locationsText].filter(Boolean).join(" ");
    if (!inUk(where)) continue;
    out.push(
      listing(feed, info?.jobReqId ?? p.externalPath, {
        title: p.title,
        url: info?.externalUrl ?? `https://${host}/en-US/${site}${p.externalPath}`,
        location: info?.location ?? p.locationsText ?? null,
        contractType: info?.timeType ?? null,
        description: htmlToText(info?.jobDescription ?? ""),
        postedAt: info?.startDate ?? null,
        expiresAt: info?.endDate?.slice(0, 10) ?? null,
      }),
    );
    await sleep(400);
  }
  return out;
}

// A careers site without one of the systems above: its sitemap lists every job page, and each
// page carries structured job data. Only pages whose address looks early-career are read.
async function sitemap(feed: Feed, known: Set<string>): Promise<Listing[] | null> {
  const urls: string[] = [];
  const queue = [feed.ats_id];
  for (let i = 0; i < queue.length && i < 25; i++) {
    let xml = "";
    try {
      const res = await fetch(queue[i], { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(25_000) });
      if (!res.ok) continue;
      xml = await res.text();
    } catch {
      continue;
    }
    for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
      const u = m[1].replace(/&amp;/g, "&");
      if (/sitemap[^/]*\.xml/i.test(u) && /job|vacanc|career|post/i.test(u)) queue.push(u);
      else if (!/\.xml$/i.test(u)) urls.push(u);
    }
  }
  if (urls.length === 0 && queue.length === 1) return null;
  const slugWanted = (u: string) => {
    const slug = decodeURIComponent(u.split("?")[0]).replace(/[-_/]+/g, " ");
    return /\/(job|jobs|vacanc|position|opportunit|role)/i.test(u) && wantedTitle(slug);
  };
  const out: Listing[] = [];
  for (const u of urls.filter(slugWanted).slice(0, 60)) {
    if (known.has(`sitemap:${feed.ats_id}:${u}`)) continue;
    const page = await readJobPage(u);
    if (!page) continue;
    const title = decodeURIComponent(u.split("?")[0].split("/").filter(Boolean).pop() ?? "").replace(/[-_]+/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
    const firstLine = page.description.split("\n").find((l) => /job title:/i.test(l))?.replace(/.*job title:\s*/i, "").trim();
    const location = page.description.split("\n").find((l) => /^\s*location:/i.test(l))?.replace(/.*location:\s*/i, "").split(".")[0].trim() ?? null;
    out.push(listing(feed, u, { title: firstLine || title.replace(/\s+[A-Z]?\d{4,}.*$/, ""), url: u, location, description: page.description, salaryMin: page.salaryMin, salaryMax: page.salaryMax, expiresAt: page.deadline, contractType: page.employmentType }));
  }
  return out;
}

export async function readFeed(feed: Feed, known: Set<string>): Promise<Listing[] | null> {
  switch (feed.ats) {
    case "greenhouse": return greenhouse(feed);
    case "lever": return lever(feed);
    case "ashby": return ashby(feed);
    case "smartrecruiters": return smartrecruiters(feed);
    case "workable": return workable(feed);
    case "workday": return workday(feed);
    case "sitemap": return sitemap(feed, known);
    default: return null;
  }
}

// ---- finding an employer's hiring system ----

// From a job link: which system hosts it and the employer's board name there.
export function feedFromUrl(url: string): { ats: string; ats_id: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  if (/(^|\.)greenhouse\.io$/.test(host)) {
    const token = u.searchParams.get("for") ?? (host.startsWith("boards-api") ? parts[2] : parts[0]);
    return token && token !== "embed" ? { ats: "greenhouse", ats_id: token.toLowerCase() } : null;
  }
  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") return parts[0] ? { ats: "lever", ats_id: parts[0].toLowerCase() } : null;
  if (host === "jobs.ashbyhq.com") return parts[0] ? { ats: "ashby", ats_id: parts[0] } : null;
  if (host === "jobs.smartrecruiters.com" || host === "careers.smartrecruiters.com") return parts[0] ? { ats: "smartrecruiters", ats_id: parts[0] } : null;
  if (host === "apply.workable.com") return parts[0] && parts[0] !== "j" ? { ats: "workable", ats_id: parts[0].toLowerCase() } : null;
  const wd = host.match(/^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/);
  if (wd) {
    const rest = parts[0] && /^[a-z]{2}-[A-Z]{2}$/.test(parts[0]) ? parts.slice(1) : parts;
    const site = rest[0];
    return site && site !== "wday" ? { ats: "workday", ats_id: `${host}/${wd[1]}/${site}` } : null;
  }
  return null;
}

// Slug guesses for an employer name on the standard job-board addresses.
export function slugGuesses(name: string): string[] {
  const clean = name.toLowerCase().replace(/&/g, "and").replace(/\([^)]*\)/g, "").replace(/\b(plc|ltd|limited|llp|group|uk|inc|the)\b/g, "").replace(/[^a-z0-9 ]/g, "").trim();
  const words = clean.split(/\s+/).filter(Boolean);
  return [...new Set([words.join(""), words.join("-"), `${words.join("")}uk`, `${words.join("")}careers`].filter((s) => s.length >= 3))];
}

// Same company? Board names are compared word by word ("Revolut" vs "Revolut Ltd").
const sameName = (a: string | undefined | null, b: string) => {
  const k = (x: string) => x.toLowerCase().replace(/&/g, "and").replace(/\b(plc|ltd|limited|llp|group|uk|inc|the)\b/g, "").replace(/[^a-z0-9]/g, "");
  return !!a && (k(a) === k(b) || k(a).startsWith(k(b)) || k(b).startsWith(k(a)));
};
const exactName = (a: string | undefined | null, b: string) => {
  const k = (x: string) => x.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
  return !!a && k(a) === k(b) && k(b).length >= 5;
};

// Tries the standard public board addresses for an employer; returns the boards that exist
// and (where the system says) belong to a company of the same name.
export async function probe(name: string): Promise<{ ats: string; ats_id: string }[]> {
  const hits: { ats: string; ats_id: string }[] = [];
  for (const slug of slugGuesses(name)) {
    const checks: [string, () => Promise<boolean>][] = [
      ["greenhouse", async () => sameName((await json<{ name: string }>(`https://boards-api.greenhouse.io/v1/boards/${slug}`))?.name, name)],
      ["lever", async () => slug.length >= 5 && (((await json<unknown[]>(`https://api.lever.co/v0/postings/${slug}?mode=json&limit=1`)) ?? (await json<unknown[]>(`https://api.eu.lever.co/v0/postings/${slug}?mode=json&limit=1`)))?.length ?? 0) > 0],
      ["ashby", async () => slug.length >= 5 && ((await json<{ jobs: unknown[] }>(`https://api.ashbyhq.com/posting-api/job-board/${slug}`))?.jobs.length ?? 0) > 0],
      ["smartrecruiters", async () => exactName((await json<{ content: { company?: { name?: string } }[] }>(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=1`))?.content?.[0]?.company?.name, name)],
      ["workable", async () => exactName((await json<{ name: string }>(`https://apply.workable.com/api/v1/widget/accounts/${slug}`))?.name, name)],
    ];
    for (const [ats, check] of checks) {
      if (hits.some((h) => h.ats === ats)) continue;
      if (await check()) hits.push({ ats, ats_id: slug });
      await sleep(150);
    }
  }
  return hits;
}

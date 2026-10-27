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

// Reading a feed retries brief network drops; probing (does this board exist?) asks once,
// quickly, so a slow site can't hold up the whole run.
async function json<T>(url: string, init?: RequestInit, { attempts = 3, timeoutMs = 25_000 } = {}): Promise<T | null> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 404 || res.status === 403 || res.status === 401 || res.status === 400) return null;
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as T;
    } catch {
      if (attempt === attempts) return null;
      await sleep(2000 * attempt);
    }
  }
  return null;
}
const quick = <T>(url: string) => json<T>(url, undefined, { attempts: 1, timeoutMs: 8000 });

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

// Oracle Recruiting Cloud: ats_id is "host/siteNumber", e.g. "abcd.fa.em2.oraclecloud.com/CX_1".
async function oracle(feed: Feed): Promise<Listing[] | null> {
  const [host, site] = feed.ats_id.split("/");
  const api = `https://${host}/hcmRestApi/resources/latest`;
  type R = { Id: string; Title: string; PrimaryLocation?: string; PostedDate?: string; ShortDescriptionStr?: string };
  const found = new Map<string, R>();
  let reachable = false;
  for (const keyword of ["graduate", "intern", "placement", "trainee", "early careers"]) {
    const res = await json<{ items: { requisitionList?: R[] }[] }>(
      `${api}/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber=${site},keyword=${encodeURIComponent(keyword)},limit=100`,
    );
    if (!res) continue;
    reachable = true;
    for (const r of res.items?.[0]?.requisitionList ?? []) if (wantedTitle(r.Title) && inUk(r.PrimaryLocation)) found.set(r.Id, r);
  }
  if (!reachable) return null;
  const out: Listing[] = [];
  for (const r of found.values()) {
    const d = await json<{ items: { ExternalDescriptionStr?: string; ExternalQualificationsStr?: string; ExternalResponsibilitiesStr?: string }[] }>(
      `${api}/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById;Id=%22${r.Id}%22,siteNumber=${site}`,
    );
    const item = d?.items?.[0];
    out.push(
      listing(feed, r.Id, {
        title: r.Title,
        url: `https://${host}/hcmUI/CandidateExperience/en/sites/${site}/job/${r.Id}`,
        location: r.PrimaryLocation ?? null,
        description: htmlToText([item?.ExternalDescriptionStr, item?.ExternalResponsibilitiesStr, item?.ExternalQualificationsStr].filter(Boolean).join("<br>") || r.ShortDescriptionStr || ""),
        postedAt: r.PostedDate ?? null,
      }),
    );
    await sleep(300);
  }
  return out;
}

// Eightfold careers sites: ats_id is "host|company domain", e.g. "careers.example.com|example.com".
async function eightfold(feed: Feed): Promise<Listing[] | null> {
  const [host, domain] = feed.ats_id.split("|");
  type P = { id: number; name: string; location?: string; locations?: string[]; t_create?: number; canonicalPositionUrl?: string; job_description?: string };
  const found = new Map<number, P>();
  let reachable = false;
  for (const query of ["graduate", "intern", "placement", "trainee", "early careers"]) {
    const res = await json<{ positions: P[] }>(`https://${host}/api/apply/v2/jobs?domain=${domain}&query=${encodeURIComponent(query)}&location=United%20Kingdom&start=0&num=50`);
    if (!res) continue;
    reachable = true;
    for (const p of res.positions ?? []) if (wantedTitle(p.name) && inUk([p.location, ...(p.locations ?? [])].join(" "))) found.set(p.id, p);
  }
  if (!reachable) return null;
  const out: Listing[] = [];
  for (const p of found.values()) {
    const d = await json<P>(`https://${host}/api/apply/v2/jobs/${p.id}?domain=${domain}`);
    out.push(
      listing(feed, String(p.id), {
        title: p.name,
        url: p.canonicalPositionUrl ?? `https://${host}/careers?pid=${p.id}&domain=${domain}`,
        location: p.location ?? p.locations?.[0] ?? null,
        description: htmlToText(d?.job_description ?? ""),
        postedAt: p.t_create ? new Date(p.t_create * 1000).toISOString() : null,
      }),
    );
    await sleep(300);
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
    case "oracle": return oracle(feed);
    case "eightfold": return eightfold(feed);
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
  const oc = host.match(/^[a-z0-9-]+\.fa\.[a-z0-9]+\.oraclecloud\.com$/);
  if (oc) {
    const i = parts.indexOf("sites");
    return i >= 0 && parts[i + 1] ? { ats: "oracle", ats_id: `${host}/${parts[i + 1]}` } : null;
  }
  if (host.endsWith(".eightfold.ai") || (u.pathname.startsWith("/careers") && u.searchParams.get("domain"))) {
    const domain = u.searchParams.get("domain");
    if (domain && host.endsWith(".eightfold.ai")) return { ats: "eightfold", ats_id: `${host}|${domain}` };
  }
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
      ["greenhouse", async () => sameName((await quick<{ name: string }>(`https://boards-api.greenhouse.io/v1/boards/${slug}`))?.name, name)],
      ["lever", async () => slug.length >= 5 && (((await quick<unknown[]>(`https://api.lever.co/v0/postings/${slug}?mode=json&limit=1`)) ?? (await quick<unknown[]>(`https://api.eu.lever.co/v0/postings/${slug}?mode=json&limit=1`)))?.length ?? 0) > 0],
      ["ashby", async () => slug.length >= 5 && ((await quick<{ jobs: unknown[] }>(`https://api.ashbyhq.com/posting-api/job-board/${slug}`))?.jobs?.length ?? 0) > 0],
      ["smartrecruiters", async () => exactName((await quick<{ content: { company?: { name?: string } }[] }>(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=1`))?.content?.[0]?.company?.name, name)],
      ["workable", async () => exactName((await quick<{ name: string }>(`https://apply.workable.com/api/v1/widget/accounts/${slug}`))?.name, name)],
    ];
    const results = await Promise.all(checks.map(async ([ats, check]) => ((await check().catch(() => false)) ? ats : null)));
    for (const ats of results) if (ats && !hits.some((h) => h.ats === ats)) hits.push({ ats, ats_id: slug });
  }
  return hits;
}

// ---- an employer's own website: find the hiring system its careers pages link to ----

const ATS_LINK = /https?:\/\/[^"'\s<>]*(myworkdayjobs\.com|greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com|smartrecruiters\.com|apply\.workable\.com|oraclecloud\.com\/hcmUI|eightfold\.ai)[^"'\s<>]*/gi;

async function page(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(10_000) });
    if (!res.ok || !/html/i.test(res.headers.get("content-type") ?? "")) return null;
    return { html: (await res.text()).slice(0, 2_000_000), finalUrl: res.url };
  } catch {
    return null;
  }
}

// Looks at the company's careers pages (careers.<domain>, jobs.<domain>, <domain>/careers and
// links from them) for links into a hiring system we can read; otherwise the careers site's
// own sitemap. Returns what it found (possibly nothing).
export async function discoverFromWebsite(domain: string): Promise<{ ats: string; ats_id: string }[]> {
  const bare = domain.replace(/^www\./, "");
  const starts = [`https://careers.${bare}`, `https://jobs.${bare}`, `https://www.${bare}/careers`, `https://www.${bare}/en/careers`, `https://${bare}`];
  const seen = new Set<string>();
  const hits = new Map<string, { ats: string; ats_id: string }>();
  const careerHosts = new Set<string>();
  const queue = [...starts];
  for (let i = 0; i < queue.length && seen.size < 10; i++) {
    const url = queue[i];
    if (seen.has(url)) continue;
    seen.add(url);
    const got = await page(url);
    if (!got) continue;
    const finalHost = new URL(got.finalUrl).hostname;
    if (/^(careers|jobs|join|work)\./.test(finalHost) || /career|jobs/i.test(new URL(got.finalUrl).pathname)) careerHosts.add(new URL(got.finalUrl).origin);
    for (const m of got.html.matchAll(ATS_LINK)) {
      const f = feedFromUrl(m[0].replace(/&amp;/g, "&"));
      if (f) hits.set(`${f.ats}|${f.ats_id}`, f);
    }
    // Follow links that look like the careers or early-careers pages (same company only).
    for (const m of got.html.matchAll(/href=["']([^"']+)["']/gi)) {
      let next: URL;
      try {
        next = new URL(m[1], got.finalUrl);
      } catch {
        continue;
      }
      if (!next.hostname.endsWith(bare.split(".").slice(-2).join("."))) continue;
      if (/(early-?careers|graduate|students|careers|jobs|search-jobs|vacancies)/i.test(next.pathname + next.hostname) && queue.length < 30) queue.push(next.href.split("#")[0]);
    }
  }
  if (hits.size) return [...hits.values()];
  // No known system: the careers site's sitemap (read with each job page's structured data).
  for (const origin of careerHosts) {
    try {
      const res = await fetch(`${origin}/robots.txt`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(8000) });
      const text = res.ok ? await res.text() : "";
      const maps = [...text.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
      const pick = maps.find((m) => /job|vacanc|career|position/i.test(m)) ?? maps[0];
      if (pick) return [{ ats: "sitemap", ats_id: pick }];
    } catch {
      // try the next one
    }
  }
  return [];
}

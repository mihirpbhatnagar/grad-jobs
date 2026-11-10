import { gunzipSync } from "node:zlib";
import { USER_AGENT, readJobPage, readPlainPage } from "../lib/employerPages.ts";
import { htmlToText, prettyLocation } from "../lib/normalise.ts";
import { dueForCheck, pageGone } from "../lib/closedPages.ts";
import { isOutsideUk, isPlacementOrApprenticeship } from "../lib/tags.ts";
import type { Listing } from "./types.ts";

// Employers' own hiring systems, read through their public job-board feeds (the same data
// their careers pages show). Only UK early-career roles are kept. Low volume: one request per
// employer per run, plus one per new graduate role where a feed needs a details call.

export type Feed = { ats: string; ats_id: string; name: string };

const EARLY = /\b(graduate|grad|graduates|trainee|entry[- ]level|early careers?|early talent|early professional|emerging talent|intern|interns|internship|summer analyst|summer associate|off[- ]cycle|spring week|spring insight|insight|junior|new grad|campus|futures?|undergraduate|vacation scheme|training contract|(analyst|associate|leadership|development|rotational|management) program(me)?)\b/i;
const SENIOR = /\b(senior|snr|sr\.?|principal|head of|director|vp|vice president|chief|lead|manager|partner|staff|experienced)\b/i;
const UK = /\b(uk|u\.k\.|united kingdom|great britain|england|scotland|wales|northern ireland|surrey|kent|essex|sussex|hampshire|berkshire|hertfordshire|buckinghamshire|oxfordshire|cambridgeshire|bedfordshire|leicestershire|nottinghamshire|derbyshire|staffordshire|warwickshire|west midlands|east midlands|yorkshire|lancashire|cheshire|cumbria|merseyside|tyne and wear|county durham|somerset|devon|cornwall|dorset|wiltshire|gloucestershire|worcestershire|shropshire|norfolk|suffolk|lincolnshire|bedford|stoke|sunderland|middlesbrough|darlington|carlisle|bolton|stockport|solihull|harlow|chelmsford|colchester|maidstone|canterbury|woking|staines|harrogate|huddersfield|bradford|wakefield|doncaster|london|manchester|birmingham|leeds|glasgow|edinburgh|bristol|cardiff|belfast|liverpool|newcastle|sheffield|nottingham|leicester|cambridge|oxford|reading|milton keynes|southampton|aberdeen|coventry|derby|warrington|york|brighton|guildford|farnborough|bath|exeter|plymouth|norwich|ipswich|swindon|slough|stevenage|crawley|chester|preston|lancaster|loughborough|cheltenham|gloucester|barrow|warton|portsmouth|basingstoke|bracknell|uxbridge|watford|hatfield|luton|peterborough|northampton|telford|wolverhampton|hull|dundee|inverness|swansea|newport|northamptonshire|silverstone|hemel hempstead|high wycombe|wrexham|knutsford|brighouse|welwyn|maidenhead|basildon|wigan|salford|rochdale|oldham|blackburn|burnley|blackpool|barnsley|rotherham|scunthorpe|grimsby|corby|nuneaton|lichfield|kidderminster|redditch|walsall|west bromwich|leamington|crewe|macclesfield|altrincham|runcorn|widnes|st helens|falkirk|kilmarnock|bridgend|llanelli|lisburn|londonderry|newry|county down|county antrim|aldershot|camberley|eastbourne|worthing|chichester|dartford|sevenoaks|tunbridge wells|tonbridge|folkestone|southend|romford|croydon|bromley|twickenham|hounslow|wembley|banbury|bicester|didcot|aylesbury|bournemouth|poole|yeovil|weybridge|leatherhead|redhill|reigate|daventry|wellingborough|burton upon trent|burton-on-trent|remote - uk|gb)\b/i;

// "2027" counts unless it's part of a date ("FTC until 01/06/2027").
const YEAR_2027 = /(?<![\d/.-])2027\b/;
export const wantedTitle = (title: string) => !isPlacementOrApprenticeship(title) && (EARLY.test(title) || YEAR_2027.test(title)) && !(SENIOR.test(title) && !/\b(graduate|grad|intern|trainee)\b/i.test(title));
// "New York" contains "York": anything that reads as abroad is not the UK.
// A US or Canadian state after the town ("Bristol, PA", "Cambridge, MA", "London, ON") isn't the UK.
const STATE_SUFFIX = /,\s*(A[LKZR]|C[AOT]|FL|GA|I[ADL]|K[SY]|M[ADINOST]|N[CDEHJMVY]|OH|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY]|DC|ON|BC|QC|AB)\b/;
const namesAbroad = (place: string) => isOutsideUk("", place) || (place.length < 120 && STATE_SUFFIX.test(place));
export const inUk = (location: string | null | undefined) => !!location && UK.test(location) && !namesAbroad(location);

// A town we don't recognise isn't abroad by default: the list above can't hold every UK town
// (Carlsberg Britvic's Hemel Hempstead scheme was being thrown out). Such a page counts as the
// UK when it pays in pounds and no other currency, sits on a UK careers site, or its opening
// text names the UK and nowhere abroad.
export function ukByOtherSigns(url: string, words: string, text: string): boolean {
  const host = url.split("/")[2] ?? "";
  const top = text.slice(0, 1500);
  const pounds = /£\s?\d/.test(text) && !/[€$]\s?\d|\b(EUR|USD|CAD|AUD)\b/.test(text);
  return inUk(words) || /\.uk$|(^|[.-])uk[.-]/i.test(host) || pounds || (UK.test(top) && !isOutsideUk(top, null));
}

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
  type J = { id: number; title: string; location?: { name?: string }; offices?: { name?: string; location?: string | null }[]; absolute_url: string; content?: string; updated_at?: string; first_published?: string };
  const res = await json<{ jobs: J[] }>(`https://boards-api.greenhouse.io/v1/boards/${feed.ats_id}/jobs?content=true`);
  if (!res) return null;
  return res.jobs
    .filter((j) => wantedTitle(j.title) && inUk([j.location?.name, ...(j.offices ?? []).flatMap((o) => [o.name, o.location])].filter(Boolean).join(" ")))
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

// Pinpoint (the Premier League, Silverstone, Aston Martin F1, Surrey Cricket, DAZN): one public
// list per employer, with the full advert and the closing date.
async function pinpoint(feed: Feed): Promise<Listing[] | null> {
  type J = {
    id: string; title: string; url: string; description?: string | null; key_responsibilities?: string | null; key_responsibilities_header?: string | null;
    skills_knowledge_expertise?: string | null; skills_knowledge_expertise_header?: string | null; benefits?: string | null; benefits_header?: string | null;
    deadline_at?: string | null; employment_type_text?: string | null; compensation_visible?: boolean; compensation_minimum?: number | null; compensation_maximum?: number | null;
    compensation_currency?: string | null; compensation_frequency?: string | null; location?: { city?: string | null; province?: string | null; name?: string | null } | null;
  };
  const res = await json<{ data: J[] }>(`https://${feed.ats_id}.pinpointhq.com/postings.json`);
  if (!res || !Array.isArray(res.data)) return null;
  const place = (j: J) => [j.location?.name, j.location?.city, j.location?.province].map((p) => p?.trim()).filter(Boolean).join(", ");
  const part = (header: string | null | undefined, html: string | null | undefined) => (html ? `${header ?? ""}\n${htmlToText(html)}`.trim() : "");
  return res.data
    .filter((j) => wantedTitle(j.title) && inUk(place(j)))
    .map((j) => {
      const yearlyPounds = j.compensation_visible && j.compensation_currency === "GBP" && /year|annual/i.test(j.compensation_frequency ?? "");
      return listing(feed, j.id, {
        title: j.title,
        url: j.url,
        location: j.location?.city?.replace(/[,\s]+$/, "") || j.location?.name || null,
        contractType: j.employment_type_text ?? null,
        description: [htmlToText(j.description ?? ""), part(j.key_responsibilities_header, j.key_responsibilities), part(j.skills_knowledge_expertise_header, j.skills_knowledge_expertise), part(j.benefits_header, j.benefits)].filter(Boolean).join("\n\n"),
        salaryMin: yearlyPounds ? (j.compensation_minimum ?? null) : null,
        salaryMax: yearlyPounds ? (j.compensation_maximum ?? j.compensation_minimum ?? null) : null,
        expiresAt: j.deadline_at?.slice(0, 10) ?? null,
      });
    });
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
  // The feed filters by country, so read every UK posting and judge each by its title.
  const postings: P[] = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const res = await json<{ content: P[]; totalFound: number }>(`https://api.smartrecruiters.com/v1/companies/${feed.ats_id}/postings?limit=100&offset=${offset}&country=gb`);
    if (!res) {
      if (offset === 0) return null;
      break;
    }
    postings.push(...res.content);
    if (res.content.length < 100 || offset + 100 >= res.totalFound) break;
  }
  const out: Listing[] = [];
  for (const p of postings.filter((x) => wantedTitle(x.name))) {
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
        description: sections.map((x) => `${x.title ?? ""}\n${htmlToText(x.text ?? "")}`).join("\n\n"),
        postedAt: p.releasedDate ?? null,
      }),
    );
    await sleep(300);
  }
  return out;
}

async function workable(feed: Feed): Promise<Listing[] | null> {
  type J = { title: string; shortcode: string; country?: string; city?: string; url: string; description?: string; published_on?: string; employment_type?: string };
  const res = await json<{ jobs: J[] }>(`https://apply.workable.com/api/v1/widget/accounts/${feed.ats_id}?details=true`);
  if (!res) return null;
  return res.jobs
    .filter((j) => wantedTitle(j.title) && inUk(`${j.city ?? ""} ${j.country ?? ""}`))
    .map((j) => listing(feed, j.shortcode, { title: j.title, url: j.url, location: j.city ?? j.country ?? null, description: htmlToText(j.description ?? ""), postedAt: j.published_on ?? null, contractType: j.employment_type ?? null }));
}

// Finds the "United Kingdom" entry in a Workday board's filters (their names vary by employer).
function ukFacet(facets: unknown, param?: string): { param: string; id: string } | null {
  if (!Array.isArray(facets)) return null;
  for (const raw of facets) {
    const f = raw as { facetParameter?: string; descriptor?: string; id?: string; values?: unknown };
    if (param && f.id && /^(united kingdom|uk|great britain|gb)$/i.test(f.descriptor ?? "")) return { param, id: f.id };
    const inner = ukFacet(f.values, f.facetParameter ?? param);
    if (inner) return inner;
  }
  return null;
}

// Workday: ats_id is "host/tenant/site", e.g. "baesystems.wd3.myworkdayjobs.com/baesystems/External".
async function workday(feed: Feed): Promise<Listing[] | null> {
  const [host, tenant, site] = feed.ats_id.split("/");
  const base = `https://${host}/wday/cxs/${tenant}/${site}`;
  type P = { title: string; externalPath: string; locationsText?: string; postedOn?: string };
  type Res = { total: number; jobPostings: P[]; facets?: unknown[] };
  const search = (body: Record<string, unknown>) => json<Res>(`${base}/jobs`, { method: "POST", body: JSON.stringify({ limit: 20, ...body }) });
  const found = new Map<string, P>();
  const first = await search({ appliedFacets: {}, offset: 0, searchText: "" });
  if (!first) return null;
  // Most boards have a country filter: read every UK job and judge each by its title. A keyword
  // search of the whole world misses UK roles (Accenture's top 100 "graduate" results were all
  // abroad) and any early-career title without the keyword.
  const uk = ukFacet(first.facets);
  const inFacet = new Set<string>();
  if (uk) {
    for (let offset = 0; offset < 2000; offset += 20) {
      const res = await search({ appliedFacets: { [uk.param]: [uk.id] }, offset, searchText: "" });
      if (!res) break;
      for (const p of res.jobPostings ?? []) {
        if (!wantedTitle(p.title)) continue;
        found.set(p.externalPath, p);
        inFacet.add(p.externalPath);
      }
      if ((res.jobPostings ?? []).length < 20) break;
      await sleep(400);
    }
  }
  // Keywords as well: the filter can miss roles (some of BP's London roles aren't under it).
  const clearlyAbroad = (p: P) => (p.locationsText && !/locations?$/i.test(p.locationsText) ? !inUk(p.locationsText) : isOutsideUk(p.title, null) && !inUk(p.title));
  for (const searchText of ["graduate", "intern", "trainee", "early careers", "2027"]) {
    for (let offset = 0; offset < (uk ? 100 : 300); offset += 20) {
      const res = await search({ appliedFacets: {}, offset, searchText });
      if (!res) break;
      for (const p of res.jobPostings ?? []) if (wantedTitle(p.title) && !clearlyAbroad(p)) found.set(p.externalPath, p);
      if ((res.jobPostings ?? []).length < 20) break;
      await sleep(400);
    }
  }
  const out: Listing[] = [];
  for (const p of found.values()) {
    type D = { jobPostingInfo?: { jobDescription?: string; location?: string; additionalLocations?: string[]; country?: { descriptor?: string }; timeType?: string; externalUrl?: string; startDate?: string; endDate?: string; jobReqId?: string } };
    const d = await json<D>(`${base}${p.externalPath}`);
    const info = d?.jobPostingInfo;
    const where = [info?.location, ...(info?.additionalLocations ?? []), info?.country?.descriptor, p.locationsText].filter(Boolean).join(" ");
    if (!inFacet.has(p.externalPath) && !inUk(where)) continue;
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
  type Res = { items: { TotalJobsCount?: number; requisitionList?: R[]; locationsFacet?: { Id: number; Name: string }[] }[] };
  const finder = (extra: string) => json<Res>(`${api}/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList,locationsFacet&finder=findReqs;siteNumber=${site},${extra}`);
  const first = await finder("facetsList=LOCATIONS,limit=1,offset=0");
  if (!first) return null;
  // Read every UK job and judge each by its title; keyword searches of the whole world miss them.
  const ukId = first.items?.[0]?.locationsFacet?.find((l) => /^united kingdom$/i.test(l.Name.trim()))?.Id;
  const found = new Map<string, R>();
  if (ukId) {
    for (let offset = 0; offset < 2000; offset += 25) {
      const res = await finder(`selectedLocationsFacet=${ukId},lastSelectedFacet=LOCATIONS,limit=25,offset=${offset}`);
      const page = res?.items?.[0]?.requisitionList ?? [];
      for (const r of page) if (wantedTitle(r.Title)) found.set(r.Id, r);
      if (page.length < 25) break;
      await sleep(300);
    }
  } else {
    for (const keyword of ["graduate", "intern", "trainee", "early careers"]) {
      for (let offset = 0; offset < 300; offset += 25) {
        const res = await finder(`keyword=${encodeURIComponent(keyword)},limit=25,offset=${offset}`);
        const page = res?.items?.[0]?.requisitionList ?? [];
        for (const r of page) if (wantedTitle(r.Title) && inUk(r.PrimaryLocation)) found.set(r.Id, r);
        if (page.length < 25) break;
        await sleep(300);
      }
    }
  }
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
  for (const query of ["graduate", "intern", "trainee", "early careers"]) {
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

// Amazon's own careers search (amazon.jobs), filtered to the UK. ats_id is unused ("amazon").
async function amazon(feed: Feed): Promise<Listing[] | null> {
  type J = { id_icims: string; title: string; country_code: string; city?: string; location?: string; job_path: string; description?: string; basic_qualifications?: string; preferred_qualifications?: string; posted_date?: string; job_schedule_type?: string };
  const found = new Map<string, J>();
  let reachable = false;
  for (const q of ["graduate", "intern", "early careers", "2027"]) {
    for (let offset = 0; offset < 200; offset += 100) {
      const res = await json<{ hits: number; jobs: J[] }>(`https://www.amazon.jobs/en/search.json?base_query=${encodeURIComponent(q)}&country=GBR&result_limit=100&offset=${offset}`);
      if (!res) break;
      reachable = true;
      for (const j of res.jobs ?? []) if (j.country_code === "GBR" && wantedTitle(j.title)) found.set(j.id_icims, j);
      if ((res.jobs ?? []).length < 100) break;
    }
  }
  if (!reachable) return null;
  return [...found.values()].map((j) =>
    listing(feed, j.id_icims, {
      title: j.title,
      url: `https://www.amazon.jobs${j.job_path}`,
      location: j.city ?? j.location ?? "United Kingdom",
      contractType: j.job_schedule_type ?? null,
      description: htmlToText([j.description, j.basic_qualifications && `Basic qualifications<br>${j.basic_qualifications}`, j.preferred_qualifications && `Preferred qualifications<br>${j.preferred_qualifications}`].filter(Boolean).join("<br><br>")),
      postedAt: j.posted_date ? new Date(j.posted_date).toISOString() : null,
    }),
  );
}

// What a morning's run shares between feeds: job ids already stored, pages to leave alone for now,
// and (filled in by the sitemap reader) ids still listed and pages ruled out.
export type FeedRun = {
  known: Set<string>;
  skip: Set<string>;
  stillListed: Set<string>;
  ruledOut: Map<string, string>;
  // Employer job pages left to read this run, so one big site can't use up the whole morning.
  pagesLeft: number;
  // Stored pages found gone earlier (a sitemap listing them no longer keeps their role open),
  // those found gone this run, and how many more stored pages may be looked at this run.
  closed: Set<string>;
  gone: Set<string>;
  checksLeft: number;
};
export const newFeedRun = (known = new Set<string>(), skip = new Set<string>(), pagesLeft = 2500, closed = new Set<string>(), checksLeft = 0): FeedRun => ({
  known, skip, stillListed: new Set(), ruledOut: new Map(), pagesLeft, closed, gone: new Set(), checksLeft,
});

const CHECKS_PER_SITE = 60;

const PAGES_PER_SITE = 100;
const safeDecode = (u: string) => {
  try {
    return decodeURIComponent(u);
  } catch {
    return u;
  }
};
// The readable part of a job page's address, without language folders ("/en-gb/", "/uk/en/").
function urlWords(u: string): string {
  let path = u;
  try {
    path = new URL(u).pathname;
  } catch {
    // keep what we were given
  }
  return safeDecode(safeDecode(path)).split("/").filter((seg) => seg && !/^[a-z]{2}([-_][a-z]{2})?$/i.test(seg)).join(" ").replace(/[-_+]+/g, " ");
}
// A title from the address when the page gives none: the longest part that isn't an id.
function titleFromUrl(u: string): string {
  const segs = safeDecode(safeDecode(u.split(/[?#]/)[0])).split("/").filter((seg) => seg && !/^\d+$/.test(seg) && !/^(job|jobs|details?|vacancy|vacancies|careers?|en|[a-z]{2}[-_][a-z]{2})$/i.test(seg));
  const best = segs.slice(2).sort((x, y) => y.length - x.length)[0] ?? "";
  return best.replace(/^\d+[-_]/, "").replace(/[-_]+/g, " ").replace(/\s+[A-Z]?\d{4,}.*$/, "").replace(/\b[a-z]/g, (c) => c.toUpperCase()).trim();
}

const NOT_JOBS = /image|video|news|blog|press|product|store|shop|categor|tag|author|article|event|insight|location|page-sitemap/i;
const JOBS_FIRST = /job|vacanc|career|position|requisition|opening|posting/i;

async function sitemapText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(25_000) });
    if (!res.ok) return null;
    if (/\.gz(\?|$)/i.test(url)) return gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8");
    return await res.text();
  } catch {
    return null;
  }
}

// A careers site without one of the systems above: its sitemap lists every job page, and each
// page carries structured job data. Pages whose address looks early-career are read, UK places
// first; each page's own data then decides the title, the place and whether it's in the UK.
async function sitemap(feed: Feed, run: FeedRun): Promise<Listing[] | null> {
  const urls: string[] = [];
  const queue = [feed.ats_id];
  let missedPart = false;
  for (let i = 0; i < queue.length && i < 25; i++) {
    const xml = await sitemapText(queue[i]);
    if (xml === null) {
      if (i === 0) return null;
      missedPart = true;
      continue;
    }
    for (const m of xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)/g)) {
      let u: string;
      try {
        u = new URL(m[1].replace(/&amp;/g, "&"), queue[i]).href;
      } catch {
        continue;
      }
      if (!/\.xml(\.gz)?(\?|$)/i.test(u) && !/\/sitemap[^/]*$/i.test(u)) urls.push(u);
      else if (/\/[a-z]{2}_[A-Z]{2}\//.test(u) && !/\/en_[A-Z]{2}\//.test(u)) continue; // the same jobs in another language
      else if (JOBS_FIRST.test(u.replace(/^https?:\/\/[^/]+/, ""))) queue.splice(i + 1, 0, u);
      else if (!NOT_JOBS.test(u.replace(/^https?:\/\/[^/]+/, ""))) queue.push(u);
    }
  }
  // Nothing listed at all is a failed read, not an employer with no jobs.
  if (urls.length === 0) return null;

  const idOf = (u: string) => `sitemap:${feed.ats_id}:${u}`;
  const stored = [...new Set(urls)].filter((u) => run.known.has(idOf(u)) && !run.closed.has(idOf(u)));
  // A sitemap can go on listing a job after it has closed, so every few days each stored page is
  // opened to see it still exists. If most of a site's pages suddenly look gone, the site is
  // having trouble and nothing is closed.
  const due = stored.filter((u) => dueForCheck(u)).slice(0, Math.min(CHECKS_PER_SITE, Math.max(0, run.checksLeft)));
  const goneNow: string[] = [];
  for (const u of due) {
    run.checksLeft--;
    if (await pageGone(u)) goneNow.push(u);
    await sleep(300);
  }
  const trust = goneNow.length > 0 && (due.length < 5 || goneNow.length <= due.length / 2);
  if (trust) for (const u of goneNow) run.gone.add(idOf(u));
  for (const u of stored) if (!run.gone.has(idOf(u))) run.stillListed.add(idOf(u));
  // Part of the sitemap couldn't be read: everything stored stays open today.
  if (missedPart) for (const id of run.known) if (id.startsWith(`sitemap:${feed.ats_id}:`) && !run.closed.has(id) && !run.gone.has(id)) run.stillListed.add(id);

  const JOB_PATH = /\/(job|vacanc|position|opportunit|role|career|opening|posting|requisition|scheme|programme)/i;
  // Folders that hold one role or scheme per page, so a plain page there is a real role.
  const ONE_ROLE_FOLDER = /\/(schemes?|programmes?|(open-)?roles?|vacanc(y|ies))\/[^/]*(graduate|grad|trainee|scheme|programme)[^/]*\/?$/i;
  const pathOf = (u: string) => u.replace(/^https?:\/\/[^/]+/, "");
  // Listing and search pages on careers sites have early-career words too, but no one job.
  const LISTING_PAGE = /\/(category|location|business|employment|search-jobs|search|our-stories|stories|blog|news|article|events?|talent-community|job-search)(\/|$)/i;
  const looksWanted = (u: string) => JOB_PATH.test(u) && !LISTING_PAGE.test(pathOf(u)) && wantedTitle(urlWords(u));
  const fresh = [...new Set(urls)].filter((u) => looksWanted(u) && !run.known.has(idOf(u)) && !run.skip.has(idOf(u)));
  // Job pages naming a UK place first, then other job pages, then anything else on the site.
  const order = (u: string) => (JOB_PATH.test(pathOf(u)) ? 0 : 2) + (inUk(urlWords(u)) ? 0 : 1);
  const todo: string[] = [];
  for (const u of fresh.sort((x, y) => order(x) - order(y))) {
    if (!inUk(urlWords(u)) && isOutsideUk(urlWords(u), null)) run.ruledOut.set(idOf(u), "outside the UK");
    else todo.push(u);
  }

  const out: Listing[] = [];
  for (const u of todo.slice(0, PAGES_PER_SITE)) {
    if (run.pagesLeft <= 0) break;
    run.pagesLeft--;
    const page = await readJobPage(u);
    if (!page) {
      const plain = ONE_ROLE_FOLDER.test(pathOf(u)) ? await readPlainPage(u) : null;
      const plainTitle = plain && (plain.title && wantedTitle(plain.title) ? plain.title : titleFromUrl(u));
      if (plain && plainTitle && wantedTitle(plainTitle) && inUk(plain.description.slice(0, 6000))) {
        out.push(listing(feed, u, { title: plainTitle, url: u, location: inUk(urlWords(u)) ? null : "United Kingdom", description: plain.description }));
      } else run.ruledOut.set(idOf(u), "no job data on page");
      continue;
    }
    const words = urlWords(u);
    const title = page.title ?? page.description.split("\n").find((l) => /job title:/i.test(l))?.replace(/.*job title:\s*/i, "").trim() ?? titleFromUrl(u);
    const location = page.location ?? page.description.split("\n").find((l) => /^\s*location:/i.test(l))?.replace(/.*location:\s*/i, "").split(".")[0].trim() ?? null;
    const uk = page.inUk ?? (location ? inUk(location) || (!namesAbroad(location) && ukByOtherSigns(u, words, page.description)) : inUk(words) || inUk(page.description.slice(0, 1500)) || ukByOtherSigns(u, words, page.description));
    if (!uk) {
      run.ruledOut.set(idOf(u), "outside the UK");
      continue;
    }
    if (!title || !wantedTitle(title)) {
      run.ruledOut.set(idOf(u), "not early-career");
      continue;
    }
    out.push(listing(feed, u, { title, url: u, location: location ?? (inUk(words) ? null : "United Kingdom"), description: page.description, salaryMin: page.salaryMin, salaryMax: page.salaryMax, expiresAt: page.deadline, contractType: page.employmentType }));
  }
  return out;
}

export async function readFeed(feed: Feed, run: FeedRun = newFeedRun()): Promise<Listing[] | null> {
  switch (feed.ats) {
    case "greenhouse": return greenhouse(feed);
    case "lever": return lever(feed);
    case "ashby": return ashby(feed);
    case "pinpoint": return pinpoint(feed);
    case "smartrecruiters": return smartrecruiters(feed);
    case "workable": return workable(feed);
    case "workday": return workday(feed);
    case "oracle": return oracle(feed);
    case "eightfold": return eightfold(feed);
    case "amazon": return amazon(feed);
    case "sitemap": return sitemap(feed, run);
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
  if (host.endsWith(".pinpointhq.com")) return { ats: "pinpoint", ats_id: host.split(".")[0] };
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
    const rest = parts[0] && /^[a-z]{2}-[a-z]{2}$/i.test(parts[0]) ? parts.slice(1) : parts;
    // A link copied from a page's source can end in stray characters ("Careers&quot;").
    const site = rest[0]?.replace(/[^A-Za-z0-9_.-].*$/, "");
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

// Which sitemap to read when robots.txt lists several: a careers site often has one per country
// and language ("/ca/fr/", "/es/es/"), so UK English first, then global English, foreign last.
export function pickSitemap(maps: string[], origin: string): string | null {
  const score = (m: string) => {
    const path = m.replace(/^https?:\/\/[^/]+/, "");
    const place = /\/(gb|uk)\/en\b|\ben[-_]gb\b|\/uk\b|\/gb\b/i.test(path) ? 4 : /\/global\/en\b|\/en\/|\/en[-_]/i.test(path) ? 3 : /\/[a-z]{2}\/[a-z]{2}\/|\/[a-z]{2}[-_][a-z]{2}\/|\/[a-z]{2}\//i.test(path) ? 0 : 2;
    return place * 2 + (JOBS_FIRST.test(path) ? 1 : 0);
  };
  const absolute: string[] = [];
  for (const m of maps) {
    try {
      absolute.push(new URL(m, origin).href);
    } catch {
      // not a usable address
    }
  }
  return absolute.sort((a, b) => score(b) - score(a))[0] ?? null;
}

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
  const starts = [`https://careers.${bare}`, `https://jobs.${bare}`, `https://search.jobs.${bare}`, `https://www.${bare}/careers`, `https://www.${bare}/en-gb/careers`, `https://www.${bare}/en/careers`, `https://${bare}`];
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
      const pick = pickSitemap(maps.length ? maps : ["/sitemap.xml"], origin);
      if (pick) return [{ ats: "sitemap", ats_id: pick }];
    } catch {
      // try the next one
    }
  }
  return [];
}

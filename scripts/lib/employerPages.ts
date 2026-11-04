import { companyKey, htmlToText } from "./normalise.ts";

// Reads the structured job data (schema.org JobPosting) that employers' own careers pages
// publish for Google. Used when a source (mainly Google Jobs) gives no description.
// Only the employer's own site or its hiring system is read, never a job board, and each
// site's robots.txt is respected. Low volume: one page at a time with a pause.

export const USER_AGENT = "GradJobsBot/1.0 (+https://gradjobsuk.vercel.app; private student project, low volume)";

// Hiring systems that host employers' own job pages.
const ATS_HOSTS = [
  "myworkdayjobs.com", "workdayjobs.com", "greenhouse.io", "lever.co", "ashbyhq.com", "smartrecruiters.com",
  "workable.com", "successfactors.com", "successfactors.eu", "oraclecloud.com", "taleo.net", "icims.com",
  "jobtrain.co.uk", "eploy.net", "tribepad.com", "pinpointhq.com", "teamtailor.com", "recruitee.com",
  "bamboohr.com", "personio.de", "personio.com", "jobvite.com", "avature.net", "phenompeople.com",
  "applytojob.com", "hibob.com", "careers-page.com", "jobs.net", "networkrail.co.uk", "civilservicejobs.service.gov.uk",
];
// Job boards and sites whose terms ban automated reading: never touched.
const BLOCKED = [
  "linkedin.", "indeed.", "glassdoor.", "targetjobs.", "gradcracker.", "prospects.ac.uk", "milkround.",
  "brightnetwork.", "ratemyplacement.", "trackr.", "totaljobs.", "cv-library.", "reed.co.uk", "monster.",
  "adzuna.", "jobsite.", "guardianjobs", "efinancialcareers.", "securityclearedjobs.", "careerjet.", "jooble.",
  "talent.com", "simplyhired.", "ziprecruiter.", "jobrapido.", "graduate-jobs.com", "graduateland.", "studentjob",
  "joinhandshake.", "builtin.", "otta.", "welcometothejungle.", "jobs.ac.uk", "nhsjobs.", "trac.jobs", "google.",
  "joinrs.", "joblinkstudent.", "findapprenticeships.", "studysmarter.", "chiropracticjobsonline.", "hackajob.",
];

export function isEmployerPage(url: string, employer: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (BLOCKED.some((b) => host.includes(b))) return false;
  if (ATS_HOSTS.some((a) => host === a || host.endsWith(`.${a}`))) return true;
  // The employer's own domain, e.g. jobsearch.baesystems.com for "BAE Systems".
  const squashed = host.replace(/[^a-z0-9]/g, "");
  const key = companyKey(employer);
  const joined = key.replace(/ /g, "");
  const first = key.split(" ")[0] ?? "";
  return (joined.length >= 3 && squashed.includes(joined)) || (first.length >= 4 && squashed.includes(first));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<Response | null> {
  try {
    return await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
  } catch {
    return null;
  }
}

// robots.txt, read the standard way: the rules for our name if there are any, else those for
// "*"; "*" in a rule is a wildcard, "$" ends it, and the longest matching rule wins (an Allow
// beats an equally long Disallow).
type RobotsRule = { allow: boolean; path: string; re: RegExp };

export function parseRobots(text: string): RobotsRule[] {
  const ours: RobotsRule[] = [];
  const everyone: RobotsRule[] = [];
  let agents: string[] = [];
  let inRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const at = line.indexOf(":");
    if (at < 0) continue;
    const field = line.slice(0, at).trim().toLowerCase();
    const value = line.slice(at + 1).trim();
    if (field === "user-agent") {
      // Several User-agent lines in a row share the rules below them.
      if (inRules) agents = [];
      inRules = false;
      agents.push(value.toLowerCase());
    } else if (field === "allow" || field === "disallow") {
      inRules = true;
      if (!value) continue;
      const pattern = value.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      const rule = { allow: field === "allow", path: value, re: new RegExp(`^${pattern}`) };
      if (agents.some((a) => a.includes("gradjobs"))) ours.push(rule);
      if (agents.includes("*")) everyone.push(rule);
    }
  }
  return ours.length ? ours : everyone;
}

export function robotsAllows(rules: RobotsRule[], path: string): boolean {
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (!rule.re.test(path)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) best = rule;
  }
  return best?.allow ?? true;
}

const robotsCache = new Map<string, RobotsRule[]>();
async function allowedByRobots(url: URL): Promise<boolean> {
  if (!robotsCache.has(url.host)) {
    const res = await get(`${url.protocol}//${url.host}/robots.txt`);
    robotsCache.set(url.host, parseRobots(res?.ok ? await res.text() : ""));
  }
  return robotsAllows(robotsCache.get(url.host)!, url.pathname + url.search);
}

export type PageJob = {
  title: string | null;
  location: string | null;
  // Does the page's structured data place the job in the UK? null = it doesn't say.
  inUk: boolean | null;
  description: string;
  deadline: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  employmentType: string | null;
  logo: string | null;
  website: string | null;
};

function findPosting(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findPosting(n);
      if (hit) return hit;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return obj;
  return findPosting(obj["@graph"]);
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

const UK_COUNTRY = /^(gb|gbr|uk|u\.k\.|united kingdom|great britain|britain|england|scotland|wales|northern ireland)$/i;

// The HTML inside the first element whose opening tag matches, counting nested tags of its kind.
function innerHtml(html: string, opening: RegExp): string | null {
  const m = opening.exec(html);
  if (!m) return null;
  const tag = m[0].match(/^<([a-z0-9]+)/i)?.[1];
  if (!tag) return null;
  const start = m.index + m[0].length;
  const walker = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  walker.lastIndex = start;
  let depth = 1;
  for (let t = walker.exec(html); t; t = walker.exec(html)) {
    depth += t[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, t.index);
  }
  return html.slice(start, start + 20_000);
}

const metaContent = (html: string, property: string) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)`, "i"))?.[1] ?? null;

// Sites without the JSON job data: pages marked up with schema.org "itemprop" attributes
// (SuccessFactors, used by EY, BBC, Nestle, SAP...) or Avature's labelled fields (Tesco, IBM...).
function jobFromMarkup(html: string): { title: string | null; description: string; location: string | null; inUk: boolean | null; deadline: string | null } | null {
  const prop = (name: string) => {
    const opening = new RegExp(`<[a-z0-9]+\\b[^>]*itemprop=["']${name}["'][^>]*>`, "i");
    const content = opening.exec(html)?.[0].match(/\bcontent=["']([^"']*)/i)?.[1];
    return htmlToText(content ?? innerHtml(html, opening) ?? "") || null;
  };
  const ogTitle = htmlToText(metaContent(html, "og:title") ?? "") || null;

  const micro = prop("description");
  if (micro && micro.length >= 150) {
    const country = prop("addressCountry");
    const place = [prop("addressLocality"), prop("addressRegion")].filter(Boolean).join(", ") || null;
    const until = prop("validThrough");
    return { title: prop("title") ?? ogTitle, description: micro, location: place, inUk: country ? UK_COUNTRY.test(country) : null, deadline: until && /^\d{4}-\d{2}-\d{2}/.test(until) ? until.slice(0, 10) : null };
  }

  if (html.includes("article__content__view__field")) {
    const fields = new Map<string, string>();
    for (const m of html.matchAll(/article__content__view__field__label[^>]*>([\s\S]{0,200}?)<\/[a-z0-9]+>\s*<[a-z0-9]+[^>]*article__content__view__field__value[^>]*>([\s\S]{0,600}?)<\/[a-z0-9]+>/gi)) {
      fields.set(htmlToText(m[1]).replace(/:$/, "").toLowerCase(), htmlToText(m[2]));
    }
    const blocks = [...html.matchAll(/<[a-z0-9]+\b[^>]*field--rich-text[^>]*>/gi)].map((m) => htmlToText(innerHtml(html.slice(m.index), /<[a-z0-9]+\b[^>]*field--rich-text[^>]*>/i) ?? ""));
    const description = blocks.filter(Boolean).join("\n\n");
    if (description.length >= 150) {
      const place = [...fields].find(([k]) => /location|city|office/.test(k))?.[1] ?? null;
      const country = [...fields].find(([k]) => /country/.test(k))?.[1] ?? null;
      return { title: ogTitle, description, location: place ?? country, inUk: country ? UK_COUNTRY.test(country) : null, deadline: null };
    }
  }
  return null;
}

// Where the structured data says the job is: "London, United Kingdom", and whether that's the UK.
function placeOf(p: Record<string, unknown>): { location: string | null; inUk: boolean | null } {
  const towns: string[] = [];
  const countries: string[] = [];
  const nameOf = (v: unknown) => str(v) ?? str((v as Record<string, unknown> | null | undefined)?.name);
  for (const place of [p.jobLocation].flat() as (Record<string, unknown> | string | null | undefined)[]) {
    if (!place) continue;
    if (typeof place === "string") {
      towns.push(place);
      continue;
    }
    const address = place.address ?? place;
    if (typeof address === "string") {
      towns.push(address);
      continue;
    }
    const a = address as Record<string, unknown>;
    const town = [str(a.addressLocality), str(a.addressRegion)].filter(Boolean).join(", ");
    if (town) towns.push(town);
    const country = nameOf(a.addressCountry);
    if (country) countries.push(country);
  }
  // Remote roles name the country they're open to instead.
  for (const need of [p.applicantLocationRequirements].flat()) {
    const country = nameOf(need);
    if (country) countries.push(country);
  }
  const uk = countries.some((c) => UK_COUNTRY.test(c));
  const named = [...new Set(towns)].slice(0, 3).join("; ");
  const ukCountry = countries.find((c) => UK_COUNTRY.test(c));
  return {
    location: htmlToText(named || (uk ? "United Kingdom" : countries[0] ?? "")) || (ukCountry ?? null),
    inUk: countries.length ? uk : null,
  };
}

export async function readJobPage(url: string): Promise<PageJob | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!(await allowedByRobots(parsed))) return null;
  await sleep(800);
  const res = await get(url);
  if (!res?.ok || !/html/i.test(res.headers.get("content-type") ?? "html")) return null;
  const html = await res.text();

  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let json: unknown;
    try {
      json = JSON.parse(m[1].trim());
    } catch {
      // Some sites put raw line breaks and tabs inside the JSON text; read it without them.
      try {
        json = JSON.parse(m[1].trim().replace(/[\u0000-\u001f]+/g, " "));
      } catch {
        continue;
      }
    }
    const p = findPosting(json);
    if (!p) continue;
    // Descriptions are HTML, sometimes escaped a second time (&lt;p&gt;).
    const rawDescription = (str(p.description) ?? "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    const description = htmlToText(rawDescription);
    if (description.length < 150) continue;
    const org = (p.hiringOrganization ?? {}) as Record<string, unknown>;
    const logo = str(org.logo) ?? str((org.logo as Record<string, unknown> | undefined)?.url);
    const salary = ((p.baseSalary as Record<string, unknown> | undefined)?.value ?? {}) as Record<string, unknown>;
    const unit = String(salary.unitText ?? "YEAR").toUpperCase();
    const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null);
    const yearly = unit === "YEAR";
    const until = str(p.validThrough);
    const type = p.employmentType;
    return {
      title: htmlToText(str(p.title) ?? str(p.name) ?? "") || null,
      ...placeOf(p),
      description,
      deadline: until && /^\d{4}-\d{2}-\d{2}/.test(until) ? until.slice(0, 10) : null,
      salaryMin: yearly ? num(salary.minValue) ?? num(salary.value) : null,
      salaryMax: yearly ? num(salary.maxValue) ?? num(salary.value) : null,
      employmentType: Array.isArray(type) ? type.join(", ") : str(type),
      logo: logo && /^https?:\/\//.test(logo) ? logo : null,
      website: str(org.sameAs) ?? str(org.url),
    };
  }
  const marked = jobFromMarkup(html);
  return marked && { ...marked, salaryMin: null, salaryMax: null, employmentType: null, logo: null, website: null };
}

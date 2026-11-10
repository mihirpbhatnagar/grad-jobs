// Small display helpers shared by role cards and role pages.

const gbpShort = (n: number) => (n >= 1000 ? `£${Math.round(n / 1000)}k` : `£${n}`);

export function salaryShort(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  if (min && max && max !== min) return `${gbpShort(min)}–${gbpShort(max)}`;
  return gbpShort((min ?? max)!);
}

// A listing that gives no figure but says "competitive salary".
export const isCompetitive = (salaryText: string | null | undefined, tags: { salaryCompetitive?: boolean }) =>
  !!tags.salaryCompetitive || /competitive/i.test(salaryText ?? "");

export const money = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

export const dateLong = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
export const dateShort = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// Whole days from today to a date, both as UK calendar dates (0 = today), so the countdown
// agrees with the database's date filters at any time of night.
export function daysUntil(iso: string): number {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  return Math.round((Date.parse(iso.slice(0, 10)) - Date.parse(today)) / 86_400_000);
}

// Today's date in the UK, for database filters ("2026-10-28"), and the date a week ahead.
export const ukToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
export const weekAhead = () => new Date(Date.parse(ukToday()) + 7 * 86_400_000).toISOString().slice(0, 10);

export function postedAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 30) return `Posted ${days} days ago`;
  return `Posted ${dateShort(iso)}`;
}

export function startLabel(role: { start_status: string | null; tags: { startText: string | null } }): string {
  if (role.start_status === "confirmed" && role.tags.startText) return `Starts ${role.tags.startText}`;
  if (role.start_status === "likely") return "Exact start date not mentioned";
  return "Start not stated";
}

// Older listings were stored with some HTML codes (e.g. "&#163;" for £) still in the text.
export const decodeEntities = (text: string) =>
  text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&pound;/g, "£")
    .replace(/&amp;/g, "&");

// "Glasgow (G84 8HL)" -> "Glasgow": postcodes in brackets add nothing on a card.
export const placeName = (location: string | null | undefined) =>
  location ? location.replace(/\s*\(?\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b\)?/g, "").replace(/\s*,\s*$/, "").trim() || location : null;

// One town as the sources wrote it, tidied: "Manchester, , United Kingdom", "GB - Basildon",
// "Glasgow, Scotland,GB" and "London, London" become "Manchester", "Basildon", "Glasgow", "London".
export function tidyPlace(location: string): string {
  const parts = (placeName(location) ?? location)
    .replace(/^GB\s*-\s*/i, "")
    .replace(/\bUNAVAILABLE\b/g, "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && !/^(gb|uk|united kingdom|england|scotland|wales|northern ireland)\.?$/i.test(p));
  const seen = new Set<string>();
  const kept = parts.filter((p) => !seen.has(p.toLowerCase()) && seen.add(p.toLowerCase()));
  return kept.join(", ") || location.trim();
}

// A role's towns, each once: sources write the same town in different ways ("Leeds (LS11 5AD)"
// and "Leeds, West Yorkshire"), which used to show as "Leeds +1".
export function distinctPlaces(location: string | null | undefined, locations: string[] | null | undefined): string[] {
  const out: string[] = [];
  const towns = new Set<string>();
  for (const raw of [location, ...(locations ?? [])]) {
    if (!raw?.trim()) continue;
    const place = tidyPlace(raw);
    const parts = place.toLowerCase().split(",").map((p) => p.trim());
    if (parts.some((p) => towns.has(p))) continue;
    towns.add(parts[0]);
    out.push(place);
  }
  return out;
}

// Sites that copy other firms' adverts, often with a reworded title and a guessed pay range
// (over a third of Google Jobs results link to one). Not the employer's own words.
const REPOST_HOSTS =
  /(^|\.)(studysmarter\.co\.uk|jobleads\.com|jobrapido\.com|jooble\.org|learn4good\.com|mummyjobs\.co\.uk|jobijoba\.co\.uk|bebee\.com|simplyhired\.co\.uk|adzuna\.co\.uk|jobs24\.co\.uk|royalbotania\.com|thesun\.co\.uk|huntukvisasponsors\.com|sponsorseal\.com|whatjobs\.com|justlondonjobs\.com|definitejobs\.co\.uk|fotografiska\.com|studenttimes\.org|salutemyjob\.com|ukcareersfair\.com|jobilize\.com|lucidtrack\.dev|womenforhire\.com|geckojobs\.co\.uk|talent\.com|trovit\.co\.uk|careerjet\.co\.uk|jobsora\.com|recruit\.net)$/i;

// True when the only place a role was found is a repost site: its title and pay are that site's,
// not confirmed against the employer, so cards say so and For you ranks it lower.
export function isRepostOnly(role: { apply_url: string | null; sources: string[] }): boolean {
  if (!role.apply_url || role.sources.some((s) => s !== "google_jobs")) return false;
  try {
    return REPOST_HOSTS.test(new URL(role.apply_url).hostname);
  } catch {
    return false;
  }
}

// Job boards sometimes appear as the "employer" (Google Jobs lists the board that posted it).
const BOARDS = /^(targetjobs|efinancialcareers|graduate talent|brighterbox|bright network|gradcracker|milkround|prospects|ratemyplacement|trackr|jobteaser|higherin|inspiring interns|give a grad a go|grb|graduate recruitment bureau|jobleads|jooble|totaljobs|cv-library|indeed|linkedin|glassdoor)\b/i;
export function isBoardName(employer: string): boolean {
  return BOARDS.test(employer.trim());
}

// What to show as the employer: a job board's name is replaced, since it isn't the employer.
export const employerLabel = (employer: string) => (isBoardName(employer) ? `Employer not named · via ${employer}` : employer);

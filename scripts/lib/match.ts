import { companyKey, textKey } from "./normalise.ts";

// Answers "do we already have this job?" for listings from cross-check sources
// (Adzuna, Google Jobs), whose wording differs from Reed's, so the strict dedupe key
// (which includes the description) can't be used.

// Words that don't change which job a title means: scheme wording, dates and places.
const STOP = new Set([
  "and", "the", "of", "in", "for", "a", "to", "with", "at", "uk", "role", "job", "graduate", "grad", "graduates",
  "programme", "program", "scheme", "intake", "cohort", "start", "starting", "trainee", "training", "early", "career", "careers", "entry", "level", "opportunity",
  "jan", "january", "feb", "february", "mar", "march", "apr", "april", "may", "jun", "june", "jul", "july", "aug", "august", "sep", "sept", "september", "oct", "october", "nov", "november", "dec", "december",
  "spring", "summer", "autumn", "winter", "united", "kingdom", "remote", "hybrid", "london", "manchester", "birmingham", "leeds", "glasgow", "edinburgh", "bristol", "cardiff", "belfast", "liverpool", "newcastle", "sheffield", "nottingham", "reading",
]);

function titleTokens(title: string): Set<string> {
  return new Set(textKey(title).split(" ").filter((w) => w && !STOP.has(w) && !/^20\d\d$/.test(w) && !/^\d{1,2}$/.test(w)));
}

// The same job only if one title's meaningful words all appear in the other: "Graduate Scheme -
// Finance" matches "Finance Graduate Programme 2027", but "Graduate Management Trainee -
// Marketing" is a different job from "Graduate Management Trainee - Supply Chain".
function similar(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 && b.size === 0) return true;
  if (a.size === 0 || b.size === 0) return false;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const w of small) if (!big.has(w)) return false;
  return small.size / big.size >= 0.5;
}

// An internship is never the same job as a graduate role, and a 2025 intake is never the 2027 one
// (adidas' "Sales Graduates 2027" was being merged into "Internship - Sales - Manchester 2025").
const isIntern = (title: string) => /\bintern(ship)?s?\b/i.test(title);
// "2026/27" and "2026-27" count as both years.
function yearsIn(title: string): Set<string> {
  const years = new Set(title.match(/\b20\d\d\b/g) ?? []);
  for (const m of title.matchAll(/\b20(\d\d)\s*[/-]\s*(\d\d)\b/g)) years.add(`20${m[2]}`);
  return years;
}
function differentKind(a: { intern: boolean; years: Set<string> }, b: { intern: boolean; years: Set<string> }): boolean {
  if (a.intern !== b.intern) return true;
  return a.years.size > 0 && b.years.size > 0 && ![...a.years].some((y) => b.years.has(y));
}

const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((w) => b.has(w));

// Returns a lookup giving the id of the matching known role, or null (exact wording first).
export function knownRoleIndex(roles: { id: number; employer: string; title: string }[]) {
  const byCompany = new Map<string, { id: number; tokens: Set<string>; intern: boolean; years: Set<string> }[]>();
  for (const r of roles) {
    const key = companyKey(r.employer);
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key)!.push({ id: r.id, tokens: titleTokens(r.title), intern: isIntern(r.title), years: yearsIn(r.title) });
  }
  return (employer: string, title: string): number | null => {
    const t = titleTokens(title);
    const me = { intern: isIntern(title), years: yearsIn(title) };
    const known = byCompany.get(companyKey(employer))?.filter((k) => !differentKind(k, me));
    return (known?.find((k) => same(k.tokens, t)) ?? known?.find((k) => similar(k.tokens, t)))?.id ?? null;
  };
}

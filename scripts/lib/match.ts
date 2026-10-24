import { companyKey, textKey } from "./normalise.ts";

// Answers "do we already have this job?" for listings from cross-check sources
// (Adzuna, Google Jobs), whose wording differs from Reed's, so the strict dedupe key
// (which includes the description) can't be used.

const STOP = new Set(["and", "the", "of", "in", "for", "a", "to", "with", "uk", "role", "job", "graduate"]);

function titleTokens(title: string): Set<string> {
  return new Set(textKey(title).split(" ").filter((w) => w && !STOP.has(w)));
}

function similar(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.max(a.size, b.size) >= 0.6;
}

// Returns a lookup giving the id of the matching known role, or null.
export function knownRoleIndex(roles: { id: number; employer: string; title: string }[]) {
  const byCompany = new Map<string, { id: number; tokens: Set<string> }[]>();
  for (const r of roles) {
    const key = companyKey(r.employer);
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key)!.push({ id: r.id, tokens: titleTokens(r.title) });
  }
  return (employer: string, title: string): number | null => {
    const t = titleTokens(title);
    return byCompany.get(companyKey(employer))?.find((known) => similar(known.tokens, t))?.id ?? null;
  };
}

import { GRAD_EMPLOYERS } from "../data/gradEmployers.ts";
import { brandKey } from "../../src/lib/brand.ts";
import { INTERMEDIARY } from "../../src/lib/matching.ts";
import { companyKey } from "./normalise.ts";
import { isBoardName } from "./tags.ts";

// How well known an employer is, from data already held (no AI, no paid source):
//   2 = major: on the list of big UK graduate recruiters, or 5,000+ staff on its public profile
//   1 = established: has a public (Wikipedia) profile, or 500+ staff
//   0 = everyone else, and always recruiters and job boards (the advert isn't the employer's own)
// Stored on each role as tags.prominence; All roles and For you rank higher tiers first.

// Well-known graduate employers that the two sources above miss.
const ALSO_MAJOR = [
  "Uniqlo", "Carlsberg Britvic", "Enterprise Mobility", "Decathlon", "Isio", "Grayce", "Tarmac", "Cundall", "GHD", "Egis", "MWH Treatment", "Menzies", "M Group",
  "LSEG", "Cushman & Wakefield", "UK Atomic Energy Authority", "Sizewell C", "Gleeds", "Rider Levett Bucknall", "Gardiner & Theobald", "Third Bridge", "Lichfields",
  "Better", "GLL", "Two Circles", "IMG", "Wasserman", "Octagon", "Sportradar", "Genius Sports", "Stats Perform", "DAZN", "Premier League", "The FA", "LTA", "RFU", "Silverstone",
];

export { brandKey };

export type CompanyFacts = { key: string; wikidata_id: string | null; employees: number | null };

export function prominenceIndex(companies: CompanyFacts[]): (employer: string) => 0 | 1 | 2 {
  const tierOf = (c: CompanyFacts): 0 | 1 | 2 => ((c.employees ?? 0) >= 5000 ? 2 : c.wikidata_id || (c.employees ?? 0) >= 500 ? 1 : 0);
  const major = new Set<string>();
  for (const name of [...GRAD_EMPLOYERS, ...ALSO_MAJOR]) {
    major.add(companyKey(name));
    if (brandKey(companyKey(name)).length >= 3) major.add(brandKey(companyKey(name)));
  }
  const byKey = new Map<string, 0 | 1 | 2>();
  for (const c of companies) {
    const t = tierOf(c);
    if (t > (byKey.get(c.key) ?? 0)) byKey.set(c.key, t);
  }
  return (employer: string) => {
    const name = employer.trim();
    if (!name || isBoardName(name) || INTERMEDIARY.test(name) || /^reed\b/i.test(name)) return 0;
    const key = companyKey(name);
    const brand = brandKey(key).length >= 3 ? brandKey(key) : "";
    if (major.has(key) || (brand && major.has(brand))) return 2;
    return Math.max(byKey.get(key) ?? 0, brand && brand !== key ? (byKey.get(brand) ?? 0) : 0) as 0 | 1 | 2;
  };
}

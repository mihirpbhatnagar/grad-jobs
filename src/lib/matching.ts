import { FIELDS, type ProfileAnswers } from "./profile.ts";
import type { Role } from "./roles.ts";

// For you ranking (free rules, no AI): roles matching the user's chosen fields first, then
// the other switched-on answers (sponsors, locations, salary), then a small boost for July
// 2027 starts. Each match comes with the tags that explain it.

export type Match = { role: Role; score: number; tags: string[] };

const REGIONS: Record<string, string[]> = {
  europe: ["germany", "france", "spain", "netherlands", "ireland", "switzerland", "sweden", "denmark", "norway", "poland", "italy", "belgium", "portugal", "austria", "czechia", "luxembourg"],
  "middle east": ["uae", "qatar"],
  "north america": ["united states", "canada"],
  "asia-pacific": ["singapore", "australia", "hong kong", "japan", "china", "philippines"],
  india: ["india"],
};

const MONTH = (iso: string | null | undefined) => (iso ? Number(iso.slice(5, 7)) : null);

// The title counts too: some employers only name the city there ("Sales Graduates 2027 | Manchester").
function inLocations(role: Role, wanted: string[]): string | null {
  const places = [role.location, ...role.locations, role.title].filter(Boolean).join(" ").toLowerCase();
  return wanted.find((w) => places.includes(w.toLowerCase())) ?? null;
}

// A keyword counts only at the start of a word: "sport" finds "sports" but not "transport".
// Keywords written with a trailing space ("it ", "pr ") must be the whole word.
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordStart = (k: string) => new RegExp(`(^|[^a-z])${escapeRe(k.trim())}${k.endsWith(" ") ? "(?![a-z])" : ""}`);

// For ranking, the sports field means the business side of sport. These two keywords are too
// broad to show that on their own (a bank's "Product and Partnerships" scheme isn't sport).
const TOO_BROAD: Record<string, string[]> = { sports: ["partnership", "club"] };
// School coaching and teaching jobs, sports science and recruiters asking for "sporty people"
// mention sport but aren't sports business, so they don't count as a sports match.
const NOT_SPORTS_BUSINESS =
  /\b(coach(es|ing)?|teach(er|ers|ing)|ta|tutor|classroom|school|schools|education|mentor|cover supervisor|boarding|residential|resident|sports? science|sports? scientist|athletic development|strength and conditioning|recruitment consultant|recruitment|sports? people|sports? minded|sporty)\b/i;

// Employers that are sport: a role there is a sports role even when its title doesn't say so
// ("Brand Marketing Graduates 2027" at adidas). Matched at the start of the employer's name.
export const SPORTS_EMPLOYER_STARTS = [
  "adidas", "nike", "puma", "under armour", "new balance", "asics", "castore", "gymshark", "decathlon", "jd sports", "sports direct", "frasers group", "pentland brands", "fanatics",
  "premier league", "football association", "english football league", "england and wales cricket", "rugby football union", "premiership rugby", "lawn tennis association",
  "all england lawn tennis", "uk sport", "sport england", "british olympic", "team gb", "british cycling", "uk athletics", "england netball", "jockey club",
  "ascot racecourse", "silverstone", "formula 1", "formula one", "mclaren racing", "williams racing", "mercedes-amg", "red bull racing", "red bull technology", "aston martin f1", "alpine f1",
  "city football", "manchester united", "manchester city", "arsenal", "chelsea f", "liverpool f", "tottenham hotspur", "aston villa", "newcastle united", "west ham united", "everton",
  "crystal palace", "brentford f", "nottingham forest", "wasserman", "two circles", "sportfive", "pitch international", "excel sports",
  "sportradar", "genius sports", "stats perform", "hawk-eye", "catapult sports", "dazn", "tnt sports", "sky sports", "greenwich leisure", "david lloyd",
  "puregym", "gym group", "everyone active", "places leisure", "topgolf",
];
// Short names that must be the whole name ("Better" the leisure operator, not "Better Placed Recruitment").
export const SPORTS_EMPLOYER_EXACT = ["img", "tko", "better", "gll", "wimbledon", "aeltc", "the fa", "lta", "rfu", "efl"];
export function isSportsEmployer(employer: string): boolean {
  const name = employer.trim().toLowerCase();
  const bare = name.replace(/^the /, "");
  return SPORTS_EMPLOYER_EXACT.includes(name) || SPORTS_EMPLOYER_STARTS.some((p) => bare.startsWith(p));
}

// Recruiters, job boards and sites that repost other firms' jobs: the listing may be real, but
// it isn't the employer's own, so it ranks below one that is.
const INTERMEDIARY =
  /\b(recruitment|recruiters?|resourcing|staffing|personnel|headhunt\w*|talent solutions|search consultancy|joinrs|studysmarter|brighterbox|jobs in fitness|the graduate|client network|setsales|united media|hrtechx|cfo ?insights|retail insights|firstmind)\b|\bsearch$|^(targetjobs|efinancialcareers|graduate talent|bright network|gradcracker|milkround|prospects|ratemyplacement|trackr|jobteaser|higherin|inspiring interns|give a grad a go|grb|graduate recruitment bureau|jobleads|jooble|totaljobs|cv-library|indeed|linkedin|glassdoor)\b/i;

// Roles no source has confirmed for this long may have closed, so they rank lower.
const STALE_AFTER_DAYS = 7;

// `similarity` (optional): how close each role is in meaning to the user's goals, 0–1, from
// the free embedding model. It boosts close matches and can stand in for a keyword match.
export function rankForYou(
  roles: (Role & { description?: string | null; last_seen?: string | null })[],
  a: ProfileAnswers,
  similarity: Map<number, number> = new Map(),
): Match[] {
  const fields = (a.fields.forYou ? FIELDS.filter((f) => a.fields.value.includes(f.id)) : []).map((f) => ({
    ...f,
    tests: f.keywords.filter((k) => !TOO_BROAD[f.id]?.includes(k)).map(wordStart),
  }));
  const staleBefore = new Date(Date.now() - STALE_AFTER_DAYS * 86_400_000).toISOString();
  const goalWords = a.goals.forYou
    ? a.goals.value.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 4)
    : [];
  const wantedPlaces = [...a.locations.value, ...a.locations.other.split(",").map((s) => s.trim()).filter(Boolean)];
  const d = a.dontShow;
  // Roles abroad only when the profile asks for that country or its region.
  const wantedAbroad = new Set(wantedPlaces.flatMap((p) => REGIONS[p.toLowerCase()] ?? [p.toLowerCase()]));

  const matches: Match[] = [];
  for (const role of roles) {
    const t = role.tags;
    const start = (t as { startDate?: string | null }).startDate ?? null;

    const abroad = (t as { abroad?: string | null }).abroad;
    if (abroad && !wantedAbroad.has(abroad.toLowerCase())) continue;

    // "Don't show" toggles hide only roles that state the detail.
    if (d.nonSponsors && role.sponsor_status === "not_listed") continue;
    if (d.drivingLicence && t.drivingLicence) continue;
    if (d.longSchemes && t.lengthMonths && t.lengthMonths > 18) continue;
    if (d.beforeJune && start && start < "2027-06-01") continue;
    if (d.afterSept && start && start > "2027-09-30") continue;
    if (d.otherLocations && wantedPlaces.length && !inLocations(role, wantedPlaces)) continue;

    const title = ` ${role.title.toLowerCase()} `;
    // The employer's name counts with the title: "Commercial Executive" at a football club is sport.
    const heading = `${title}| ${role.employer.toLowerCase()} `;
    const body = ` ${(role.description ?? "").toLowerCase().slice(0, 3000)} `;
    let score = 0;
    const tags: string[] = [];

    let notSportsBusiness = false;
    for (const f of fields) {
      if (f.id === "sports" && NOT_SPORTS_BUSINESS.test(heading)) {
        notSportsBusiness = true;
        continue;
      }
      const inTitle = f.tests.some((re) => re.test(heading)) || (f.id === "sports" && isSportsEmployer(role.employer));
      const inBody = f.tests.filter((re) => re.test(body)).length;
      if (inTitle || inBody >= 2) {
        score += inTitle ? 10 : 4;
        tags.push(f.label.split(" ")[0]);
      }
    }
    const sim = similarity.get(role.id) ?? 0;
    if (fields.length && score === 0) {
      // Must match a chosen field, by keyword or by meaning (a coaching job is close in meaning
      // to "sport" but was ruled out above, so it doesn't come back in this way).
      if (notSportsBusiness || sim < 0.4) continue;
      tags.push("Close match");
    }
    score += Math.max(0, sim - 0.2) * 40;

    const goalHits = goalWords.filter((w) => title.includes(w) || body.includes(w)).length;
    if (goalHits) score += Math.min(goalHits, 3) * 2;

    if (a.sponsors.forYou && a.sponsors.value && role.sponsor_status === "likely") {
      score += 3;
      tags.push("Sponsor");
    }
    if (a.locations.forYou && wantedPlaces.length) {
      const place = inLocations(role, wantedPlaces);
      if (place) {
        score += 3;
        tags.push(place);
      }
    }
    if (a.salary.forYou && a.salary.value && (role.salary_max ?? role.salary_min ?? 0) >= a.salary.value) {
      score += 2;
      tags.push(`£${Math.round(a.salary.value / 1000)}k+`);
    }
    const month = MONTH(start);
    if (month === 7) score += 1;
    if (t.startText) tags.push(`${t.startText} start`);
    if (role.last_seen && role.last_seen < staleBefore) score -= 6;
    if (INTERMEDIARY.test(role.employer.trim())) score -= 8;

    matches.push({ role, score, tags: [...new Set(tags)] });
  }
  return matches.sort((x, y) => y.score - x.score);
}

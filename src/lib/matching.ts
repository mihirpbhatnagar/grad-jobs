import { FIELDS, type ProfileAnswers } from "./profile.ts";
import type { Role } from "./roles.ts";

// For you ranking (free rules, no AI): roles matching the user's chosen fields first, then
// the other switched-on answers (sponsors, locations, salary), then a small boost for July
// 2027 starts. Each match comes with the tags that explain it.

export type Match = { role: Role; score: number; tags: string[] };

const MONTH = (iso: string | null | undefined) => (iso ? Number(iso.slice(5, 7)) : null);

function inLocations(role: Role, wanted: string[]): string | null {
  const places = [role.location, ...role.locations].filter(Boolean).join(" ").toLowerCase();
  return wanted.find((w) => places.includes(w.toLowerCase())) ?? null;
}

// `similarity` (optional): how close each role is in meaning to the user's goals, 0–1, from
// the free embedding model. It boosts close matches and can stand in for a keyword match.
export function rankForYou(
  roles: (Role & { description?: string | null })[],
  a: ProfileAnswers,
  similarity: Map<number, number> = new Map(),
): Match[] {
  const fields = a.fields.forYou ? FIELDS.filter((f) => a.fields.value.includes(f.id)) : [];
  const goalWords = a.goals.forYou
    ? a.goals.value.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 4)
    : [];
  const wantedPlaces = [...a.locations.value, ...a.locations.other.split(",").map((s) => s.trim()).filter(Boolean)];
  const d = a.dontShow;

  const matches: Match[] = [];
  for (const role of roles) {
    const t = role.tags;
    const start = (t as { startDate?: string | null }).startDate ?? null;

    // "Don't show" toggles hide only roles that state the detail.
    if (d.nonSponsors && role.sponsor_status === "not_listed") continue;
    if (d.drivingLicence && t.drivingLicence) continue;
    if (d.longSchemes && t.lengthMonths && t.lengthMonths > 18) continue;
    if (d.beforeJune && start && start < "2027-06-01") continue;
    if (d.afterSept && start && start > "2027-09-30") continue;
    if (d.otherLocations && wantedPlaces.length && !inLocations(role, wantedPlaces)) continue;

    const title = ` ${role.title.toLowerCase()} `;
    const body = ` ${(role.description ?? "").toLowerCase().slice(0, 3000)} `;
    let score = 0;
    const tags: string[] = [];

    for (const f of fields) {
      const inTitle = f.keywords.some((k) => title.includes(k));
      const inBody = f.keywords.filter((k) => body.includes(k)).length;
      if (inTitle || inBody >= 2) {
        score += inTitle ? 10 : 4;
        tags.push(f.label.split(" ")[0]);
      }
    }
    const sim = similarity.get(role.id) ?? 0;
    if (fields.length && score === 0) {
      if (sim < 0.4) continue; // must match a chosen field, by keyword or by meaning
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

    matches.push({ role, score, tags: [...new Set(tags)] });
  }
  return matches.sort((x, y) => y.score - x.score);
}

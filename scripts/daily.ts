// Daily data job. Run locally with `npm run daily`, and every morning by GitHub Actions.
// Flags: --retag-only  re-check stored roles without searching any source.
//        --retag  re-run the scope check, tagging, start status and sponsor matching on every open role.

import { adminClient, chunks, must, selectAll } from "./lib/db.ts";
import { loadEnv } from "./lib/env.ts";
import { knownRoleIndex } from "./lib/match.ts";
import { embed, roleText } from "./lib/embed.ts";
import { lookupCompanies } from "./lib/companies.ts";
import { isEmployerPage, readJobPage } from "./lib/employerPages.ts";
import { companyKey, dedupeKey, prettyLocation } from "./lib/normalise.ts";
import { refreshSponsors, sponsorMatcher, type SponsorMatch } from "./lib/sponsors.ts";
import { isEarlyCareer, isSeniorTitle, roleKind, startStatus, tagListing, type RoleTags } from "./lib/tags.ts";
import { GOOGLE_JOBS_QUERIES, searchGoogleJobs } from "./sources/googleJobs.ts";
import { reedDetails, searchReed, toListing } from "./sources/reed.ts";
import type { Listing } from "./sources/types.ts";

loadEnv();
const db = adminClient();
const retagAll = process.argv.includes("--retag");
// Re-check stored roles only: no source searches (so no API calls or Google Jobs cost).
const retagOnly = process.argv.includes("--retag-only");
// A role not seen by any source for this long is treated as closed.
const CLOSE_AFTER_DAYS = 2;
// New Reed listings are fetched and saved this many at a time, so progress is never lost.
const REED_BATCH = 250;
// Earliest start users can take; read from settings in main(). Roles starting earlier are
// stored but kept out of the main list.
let earliestStart = "2027-06-01";

type Matcher = (employer: string, location: string | null) => SponsorMatch;
type ExistingRole = { id: number; dedupe_key: string; sources: string[]; locations: string[]; first_seen: string };

const keyOf = (l: Listing) => dedupeKey(l.employer, l.title, l.description);

// How complete and clearly-2027 a listing is: the default "best match" order in All roles.
type QualityInput = { tags: RoleTags; start_status: string | null; salary_min: number | null; salary_max: number | null; sponsor_status: string | null; description: string | null; expires_at: string | null };
function roleQuality(r: QualityInput): number {
  return (
    (r.start_status === "confirmed" ? 3 : r.start_status === "likely" ? 1 : 0) +
    (r.tags.graduateScheme || r.tags.programmeTitle ? 2 : 0) +
    (r.salary_min || r.salary_max ? 1 : 0) +
    (r.sponsor_status === "likely" ? 1 : 0) +
    ((r.description?.length ?? 0) > 500 ? 1 : 0) +
    (r.tags.deadline || r.expires_at ? 1 : 0)
  );
}

function roleRow(l: Listing, match: SponsorMatch, existing: ExistingRole | undefined, now: string) {
  const tags = tagListing(l.title, l.description);
  const locations = [...new Set([...(existing?.locations ?? []), ...(l.location ? [l.location] : [])])];
  const start_status = startStatus(tags, earliestStart);
  return {
    company_key: companyKey(l.employer),
    quality: roleQuality({ tags, start_status, salary_min: l.salaryMin, salary_max: l.salaryMax, sponsor_status: match.status, description: l.description, expires_at: l.expiresAt }),
    dedupe_key: keyOf(l),
    title: l.title,
    employer: l.employer,
    location: locations[0] ?? null,
    locations,
    salary_min: l.salaryMin,
    salary_max: l.salaryMax,
    salary_text: l.salaryText,
    contract_type: l.contractType,
    full_time: l.fullTime,
    part_time: l.partTime,
    description: l.description,
    apply_url: l.applyUrl,
    posted_at: l.postedAt,
    expires_at: l.expiresAt,
    tags,
    kind: roleKind(l.title),
    start_status,
    sponsor_status: match.status,
    sponsor_name: match.name,
    sources: [...new Set([...(existing?.sources ?? []), l.source])],
    first_seen: existing?.first_seen ?? now,
    last_seen: now,
    is_open: true,
  };
}

// Saves listings as roles, merging duplicates (same employer, title and wording) into one
// role with every location. `byKey` is the in-memory index of roles already stored.
async function saveListings(listings: Listing[], match: Matcher, byKey: Map<string, ExistingRole>) {
  const now = new Date().toISOString();
  const rows = new Map<string, ReturnType<typeof roleRow>>();
  for (const l of listings) {
    const key = keyOf(l);
    const row = rows.get(key);
    if (!row) rows.set(key, roleRow(l, match(l.employer, l.location), byKey.get(key), now));
    else if (l.location && !row.locations.includes(l.location)) row.locations.push(l.location);
  }

  const newRoles = [...rows.keys()].filter((k) => !byKey.has(k)).length;
  for (const batch of chunks([...rows.values()], 100)) {
    const saved = await must(() => db.from("roles").upsert(batch, { onConflict: "dedupe_key" }).select("id,dedupe_key"));
    for (const r of saved) {
      const row = rows.get(r.dedupe_key)!;
      byKey.set(r.dedupe_key, { id: r.id, dedupe_key: r.dedupe_key, sources: row.sources, locations: row.locations, first_seen: row.first_seen });
    }
  }

  const links = listings.map((l) => ({
    source: l.source,
    source_id: l.sourceId,
    role_id: byKey.get(keyOf(l))!.id,
    url: l.sourceUrl,
    last_seen: now,
  }));
  for (const batch of chunks(links, 500)) {
    await must(() => db.from("role_sources").upsert(batch, { onConflict: "source,source_id" }));
  }
  return { newRoles, mergedDuplicates: listings.length - rows.size };
}

// Remembers listings that failed the early-career check, so they aren't re-fetched daily.
async function saveExcluded(listings: Listing[], reason: string) {
  const now = new Date().toISOString();
  const rows = listings.map((l) => ({ source: l.source, source_id: l.sourceId, reason, last_seen: now }));
  for (const batch of chunks(rows, 500)) {
    await must(() => db.from("excluded_listings").upsert(batch, { onConflict: "source,source_id" }));
  }
}

async function markSeen(source: string, sourceIds: string[]) {
  const now = new Date().toISOString();
  for (const batch of chunks(sourceIds, 200)) {
    const linked = await must(() =>
      db.from("role_sources").update({ last_seen: now }).eq("source", source).in("source_id", batch).select("role_id"),
    );
    const roleIds = [...new Set(linked.map((r) => r.role_id))];
    if (roleIds.length) await must(() => db.from("roles").update({ last_seen: now, is_open: true }).in("id", roleIds));
  }
}

async function knownSourceIds(source: string): Promise<Set<string>> {
  const linked = await selectAll<{ source_id: string }>((from, to) =>
    db.from("role_sources").select("source_id").eq("source", source).order("source_id").range(from, to),
  );
  const excluded = await selectAll<{ source_id: string }>((from, to) =>
    db.from("excluded_listings").select("source_id").eq("source", source).order("source_id").range(from, to),
  );
  return new Set([...linked, ...excluded].map((r) => r.source_id));
}

async function pullReed(match: Matcher, byKey: Map<string, ExistingRole>) {
  const linked = await selectAll<{ source_id: string }>((from, to) =>
    db.from("role_sources").select("source_id").eq("source", "reed").order("source_id").range(from, to),
  );
  const linkedIds = new Set(linked.map((r) => r.source_id));
  const knownIds = await knownSourceIds("reed");

  const { results, calls } = await searchReed();
  const newIds = [...results.keys()].filter((id) => !knownIds.has(String(id)));
  console.log(`Reed: ${results.size} listings found (${calls} searches), ${newIds.length} not seen before`);

  // Clearly senior titles are ruled out from the search result alone, saving a details call each.
  const senior = new Set(newIds.filter((id) => isSeniorTitle(results.get(id)!.jobTitle)));
  await saveExcluded([...senior].map((id) => toListing(results.get(id)!, undefined)), "senior title");
  const toFetch = newIds.filter((id) => !senior.has(id));

  const totals = { found: results.size, searches: calls, new: newIds.length, kept: 0, excluded: senior.size, newRoles: 0, mergedDuplicates: 0, detailsFailed: 0 };
  for (const [i, batch] of chunks(toFetch, REED_BATCH).entries()) {
    const details = await reedDetails(batch);
    // A listing whose details didn't arrive is left for tomorrow's run rather than judged on
    // Reed's short preview text.
    const listings = batch.filter((id) => details.has(id)).map((id) => toListing(results.get(id)!, details.get(id)));
    totals.detailsFailed += batch.length - listings.length;
    const keep = listings.filter((l) => isEarlyCareer(l.title, l.description));
    const drop = listings.filter((l) => !keep.includes(l));
    const saved = await saveListings(keep, match, byKey);
    await saveExcluded(drop, "not early-career");
    totals.kept += keep.length;
    totals.excluded += drop.length;
    totals.newRoles += saved.newRoles;
    totals.mergedDuplicates += saved.mergedDuplicates;
    console.log(`  batch ${i + 1}/${Math.ceil(toFetch.length / REED_BATCH)}: kept ${keep.length}, excluded ${drop.length}`);
  }

  await markSeen("reed", [...results.keys()].map(String).filter((id) => linkedIds.has(id)));
  return totals;
}

// Cross-check sources (Google Jobs) have no description, so they're matched to known roles
// by employer + title. Matches are credited to the existing role; anything new joins the feed.
async function saveCrossCheck(source: string, listings: Listing[], match: Matcher, byKey: Map<string, ExistingRole>) {
  const roles = await selectAll<{ id: number; employer: string; title: string; sources: string[] }>((from, to) =>
    db.from("roles").select("id,employer,title,sources").eq("is_open", true).order("id").range(from, to),
  );
  const findRole = knownRoleIndex(roles);
  const sourcesById = new Map(roles.map((r) => [r.id, r.sources]));
  const now = new Date().toISOString();

  const links: { source: string; source_id: string; role_id: number; url: string | null; last_seen: string }[] = [];
  const unmatched: Listing[] = [];
  const senior: Listing[] = [];
  for (const l of listings) {
    const roleId = findRole(l.employer, l.title);
    if (roleId) links.push({ source: l.source, source_id: l.sourceId, role_id: roleId, url: l.sourceUrl, last_seen: now });
    else if (isSeniorTitle(l.title)) senior.push(l);
    else unmatched.push(l);
  }

  for (const batch of chunks(links, 500)) {
    await must(() => db.from("role_sources").upsert(batch, { onConflict: "source,source_id" }));
  }
  // Add the source to each matched role, grouping roles that end up with the same list.
  const groups = new Map<string, number[]>();
  for (const id of new Set(links.map((l) => l.role_id))) {
    const key = JSON.stringify([...new Set([...(sourcesById.get(id) ?? []), source])].sort());
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }
  for (const [key, ids] of groups) {
    for (const batch of chunks(ids, 200)) {
      await must(() => db.from("roles").update({ sources: JSON.parse(key), last_seen: now, is_open: true }).in("id", batch));
    }
  }

  await saveExcluded(senior, "senior title");
  const saved = await saveListings(unmatched, match, byKey);
  return { found: listings.length, matchedExisting: links.length, newRoles: saved.newRoles, excluded: senior.length };
}

// Adds a meaning-embedding to main-list roles that don't have one yet (for For you).
async function embedNewRoles(): Promise<number> {
  const roles = await selectAll<{ id: number; title: string; description: string | null }>((from, to) =>
    db.from("roles").select("id,title,description").eq("is_open", true).eq("kind", "job").eq("part_time", false)
      .in("start_status", ["confirmed", "likely"]).is("embedding", null).order("id").range(from, to),
  );
  for (const batch of chunks(roles, 32)) {
    const vectors = await embed(batch.map((r) => roleText(r.title, r.description)));
    for (const [i, r] of batch.entries()) {
      await must(() => db.from("roles").update({ embedding: `[${vectors[i].join(",")}]` }).eq("id", r.id));
    }
  }
  return roles.length;
}

async function setting<T>(key: string, fallback: T): Promise<T> {
  const { data } = await db.from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}

async function closeStaleRoles(): Promise<number> {
  const cutoff = new Date(Date.now() - CLOSE_AFTER_DAYS * 86_400_000).toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const stale = await must(() => db.from("roles").update({ is_open: false }).eq("is_open", true).lt("last_seen", cutoff).select("id"));
  const expired = await must(() => db.from("roles").update({ is_open: false }).eq("is_open", true).lt("expires_at", today).select("id"));
  return stale.length + expired.length;
}

// The database stores JSON with its keys reordered, so compare with keys sorted.
function sameJson(a: unknown, b: unknown): boolean {
  const sorted = (v: unknown): unknown =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y)).map(([k, val]) => [k, sorted(val)]))
      : v;
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

// Re-applies the early-career check, tagging and sponsor matching to open roles. Roles that
// no longer pass the check are removed and remembered as excluded; only changed rows are written.
async function retag(match: Matcher) {
  type Row = { id: number; title: string; employer: string; location: string | null; description: string | null; tags: unknown; sponsor_status: string | null; sponsor_name: string | null; kind: string; start_status: string | null; locations: string[]; company_key: string | null; quality: number; salary_min: number | null; salary_max: number | null; expires_at: string | null };
  const roles = await selectAll<Row>((from, to) =>
    db.from("roles").select("id,title,employer,location,locations,description,tags,sponsor_status,sponsor_name,kind,start_status,company_key,quality,salary_min,salary_max,expires_at").eq("is_open", true).order("id").range(from, to),
  );

  const outOfScope = roles.filter((r) => (r.description ? !isEarlyCareer(r.title, r.description) : isSeniorTitle(r.title)));
  const removeIds = outOfScope.map((r) => r.id);
  for (const batch of chunks(removeIds, 200)) {
    const links = await must(() => db.from("role_sources").select("source,source_id").in("role_id", batch));
    const now = new Date().toISOString();
    const excluded = links.map((l) => ({ ...l, reason: "not early-career", last_seen: now }));
    if (excluded.length) await must(() => db.from("excluded_listings").upsert(excluded, { onConflict: "source,source_id" }));
    await must(() => db.from("roles").delete().in("id", batch));
  }

  let changed = 0;
  const removed = new Set(removeIds);
  for (const r of roles) {
    if (removed.has(r.id)) continue;
    const tags = tagListing(r.title, r.description ?? "");
    const m = match(r.employer, r.location);
    const start_status = startStatus(tags, earliestStart);
    const next = {
      tags,
      sponsor_status: m.status,
      sponsor_name: m.name,
      kind: roleKind(r.title),
      start_status,
      location: prettyLocation(r.location),
      locations: [...new Set(r.locations.map((l) => prettyLocation(l) ?? l))],
      company_key: companyKey(r.employer),
      quality: roleQuality({ ...r, tags, start_status, sponsor_status: m.status }),
    };
    const current = { tags: r.tags, sponsor_status: r.sponsor_status, sponsor_name: r.sponsor_name, kind: r.kind, start_status: r.start_status, location: r.location, locations: r.locations, company_key: r.company_key, quality: r.quality };
    if (sameJson(next, current)) continue;
    await must(() => db.from("roles").update(next).eq("id", r.id));
    changed++;
  }
  return { removedOutOfScope: removeIds.length, updated: changed };
}

// Listings without a description (mostly from Google Jobs): read the employer's own job page
// for the full text, then re-tag it (start date, deadline, degree...). Retried weekly.
const pageLogos = new Map<string, string>();
async function fillMissingDetails(limit = 400) {
  type Row = { id: number; title: string; employer: string; apply_url: string | null; salary_min: number | null; salary_max: number | null; expires_at: string | null; contract_type: string | null; sponsor_status: string | null };
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const roles = (await must(() =>
    db.from("roles").select("id,title,employer,apply_url,salary_min,salary_max,expires_at,contract_type,sponsor_status")
      .eq("is_open", true).eq("kind", "job").eq("part_time", false).in("start_status", ["confirmed", "likely", "unknown"])
      .or("description.is.null,description.eq.").or(`details_checked_at.is.null,details_checked_at.lt.${weekAgo}`)
      .order("quality", { ascending: false }).limit(limit),
  )) as Row[];
  let filled = 0;
  for (const r of roles) {
    const links = await must(() => db.from("role_sources").select("url").eq("role_id", r.id));
    const urls = [...new Set([...links.map((l) => l.url as string | null), r.apply_url])].filter((u): u is string => !!u && isEmployerPage(u, r.employer));
    let page = null;
    for (const url of urls) {
      page = await readJobPage(url);
      if (page) break;
    }
    const update: Record<string, unknown> = { details_checked_at: new Date().toISOString() };
    if (page) {
      const tags = tagListing(r.title, page.description);
      const start_status = startStatus(tags, earliestStart);
      const salary_min = r.salary_min ?? page.salaryMin;
      const salary_max = r.salary_max ?? page.salaryMax;
      const expires_at = r.expires_at ?? page.deadline ?? tags.deadline;
      Object.assign(update, {
        description: page.description, tags, start_status, salary_min, salary_max, expires_at,
        contract_type: r.contract_type ?? page.employmentType?.toLowerCase().replace(/_/g, " ") ?? null,
        quality: roleQuality({ tags, start_status, salary_min, salary_max, sponsor_status: r.sponsor_status, description: page.description, expires_at }),
      });
      if (page.logo) pageLogos.set(companyKey(r.employer), page.logo);
      filled++;
    }
    await must(() => db.from("roles").update(update).eq("id", r.id));
  }
  return { checked: roles.length, filled };
}

// A graduate role whose listing gives no start date counts as a likely 2027 start when the
// same employer's other graduate roles are for 2027 (e.g. Asda's six graduate programmes).
async function inferSiblingStarts() {
  const roles = await selectAll<{ id: number; title: string; company_key: string | null; start_status: string; quality: number }>((from, to) =>
    db.from("roles").select("id,title,company_key,start_status,quality").eq("is_open", true).eq("kind", "job").eq("part_time", false)
      .in("start_status", ["confirmed", "likely", "unknown"]).ilike("title", "%grad%").order("id").range(from, to),
  );
  const with2027 = new Set(roles.filter((r) => r.start_status !== "unknown" && r.company_key).map((r) => r.company_key));
  const upgrade = roles.filter((r) => r.start_status === "unknown" && with2027.has(r.company_key) && /\bgrad(uate)?s?\b/i.test(r.title));
  for (const r of upgrade) {
    await must(() => db.from("roles").update({ start_status: "likely", quality: r.quality + 1 }).eq("id", r.id));
  }
  return upgrade.length;
}

// Company facts and logos for employers with open roles; looked up once, refreshed monthly.
async function refreshCompanies(limit = 1500) {
  const roles = await selectAll<{ company_key: string | null; employer: string }>((from, to) =>
    db.from("roles").select("company_key,employer").eq("is_open", true).not("company_key", "is", null).order("id").range(from, to),
  );
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const known = await selectAll<{ key: string; logo_url: string | null }>((from, to) =>
    db.from("companies").select("key,logo_url").gte("checked_at", monthAgo).order("key").range(from, to),
  );
  const fresh = new Map(known.map((k) => [k.key, k.logo_url]));
  const todo = new Map<string, string>();
  for (const r of roles) if (r.company_key && !fresh.has(r.company_key) && !todo.has(r.company_key)) todo.set(r.company_key, r.employer);
  const names = [...todo].slice(0, limit);
  let found = 0;
  for (const batch of chunks(names, 100)) {
    const rows = await lookupCompanies(new Map(batch));
    for (const row of rows) {
      row.logo_url ??= pageLogos.get(row.key) ?? null;
      if (row.wikidata_id) found++;
    }
    await must(() => db.from("companies").upsert(rows, { onConflict: "key" }));
  }
  // Logos found on employers' own job pages fill gaps for companies already stored.
  for (const [key, logo] of pageLogos) {
    if (fresh.has(key) && !fresh.get(key)) await must(() => db.from("companies").update({ logo_url: logo }).eq("key", key));
  }
  return { lookedUp: names.length, found };
}

async function enrich(stats: Record<string, unknown>) {
  stats.details = await fillMissingDetails();
  console.log("Employer pages:", JSON.stringify(stats.details));
  stats.inferredStarts = await inferSiblingStarts();
  stats.companies = await refreshCompanies();
  console.log("Companies:", JSON.stringify(stats.companies));
}

async function main() {
  const run = await must<{ id: number }>(() => db.from("ingest_runs").insert({ job: "daily" }).select("id").single());
  const stats: Record<string, unknown> = {};

  try {
    earliestStart = await setting("feed.earliest_start", earliestStart);
    const { sponsors, refreshed } = await refreshSponsors(db);
    stats.sponsors = sponsors.length;
    stats.sponsorRegisterRefreshed = refreshed;
    const match = sponsorMatcher(sponsors);
    console.log(`Sponsor register: ${sponsors.length} entries${refreshed ? " (new file loaded)" : ""}`);

    const existing = await selectAll<ExistingRole>((from, to) =>
      db.from("roles").select("id,dedupe_key,sources,locations,first_seen").order("id").range(from, to),
    );
    const byKey = new Map(existing.map((r) => [r.dedupe_key, r]));

    if (retagOnly) {
      stats.retagged = await retag(match);
      await enrich(stats);
      stats.embedded = await embedNewRoles();
      console.log("Done:", JSON.stringify(stats));
      await db.from("ingest_runs").update({ finished_at: new Date().toISOString(), stats }).eq("id", run.id);
      return;
    }

    stats.reed = await pullReed(match, byKey);

    if (process.env.DATAFORSEO_LOGIN) {
      const depth = await setting("google_jobs.depth", 50);
      const maxCost = await setting("google_jobs.max_cost_usd_per_run", 0.1);
      const google = await searchGoogleJobs(GOOGLE_JOBS_QUERIES, depth, maxCost);
      console.log(`Google Jobs: ${google.listings.length} listings from ${google.tasks} searches ($${google.costUsd.toFixed(4)})`);
      stats.googleJobs = { ...(await saveCrossCheck("google_jobs", google.listings, match, byKey)), costUsd: google.costUsd };
    }

    stats.closed = await closeStaleRoles();
    if (retagAll || refreshed) stats.retagged = await retag(match);
    await enrich(stats);
    stats.embedded = await embedNewRoles();

    const { count } = await db.from("roles").select("id", { count: "exact", head: true }).eq("is_open", true);
    stats.openRoles = count;
    console.log("Done:", JSON.stringify(stats));
    await db.from("ingest_runs").update({ finished_at: new Date().toISOString(), stats }).eq("id", run.id);
  } catch (err) {
    await db.from("ingest_runs").update({ finished_at: new Date().toISOString(), stats, error: String(err) }).eq("id", run.id);
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

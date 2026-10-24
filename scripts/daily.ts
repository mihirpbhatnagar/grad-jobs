// Daily data job. Run locally with `npm run daily`, and every morning by GitHub Actions.
// Flags: --retag  re-run text tagging and sponsor matching on every open role.

import { adminClient, chunks, selectAll } from "./lib/db.ts";
import { loadEnv } from "./lib/env.ts";
import { dedupeKey } from "./lib/normalise.ts";
import { refreshSponsors, sponsorMatcher, type SponsorMatch } from "./lib/sponsors.ts";
import { tagListing } from "./lib/tags.ts";
import { reedDetails, searchReed, toListing } from "./sources/reed.ts";
import type { Listing } from "./sources/types.ts";

loadEnv();
const db = adminClient();
const retagAll = process.argv.includes("--retag");
// A role not seen by any source for this long is treated as closed.
const CLOSE_AFTER_DAYS = 2;

type ExistingRole = { id: number; dedupe_key: string; sources: string[]; locations: string[]; first_seen: string };

const keyOf = (l: Listing) => dedupeKey(l.employer, l.title, l.description);

function roleRow(l: Listing, match: SponsorMatch, existing: ExistingRole | undefined, now: string) {
  const tags = tagListing(l.title, l.description);
  const locations = [...new Set([...(existing?.locations ?? []), ...(l.location ? [l.location] : [])])];
  return {
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
    description: l.description,
    apply_url: l.applyUrl,
    posted_at: l.postedAt,
    expires_at: l.expiresAt,
    tags,
    sponsor_status: match.status,
    sponsor_name: match.name,
    sources: [...new Set([...(existing?.sources ?? []), l.source])],
    first_seen: existing?.first_seen ?? now,
    last_seen: now,
    is_open: true,
  };
}

async function saveListings(listings: Listing[], match: (e: string, l: string | null) => SponsorMatch) {
  const now = new Date().toISOString();
  const existing = await selectAll<ExistingRole>((from, to) =>
    db.from("roles").select("id,dedupe_key,sources,locations,first_seen").order("id").range(from, to),
  );
  const byKey = new Map(existing.map((r) => [r.dedupe_key, r]));

  // Collapse duplicates within today's batch too, gathering every location they list.
  const rows = new Map<string, ReturnType<typeof roleRow>>();
  const sourceLinks: { key: string; listing: Listing }[] = [];
  for (const l of listings) {
    const key = keyOf(l);
    const row = rows.get(key);
    if (row) {
      if (l.location && !row.locations.includes(l.location)) row.locations.push(l.location);
    } else {
      rows.set(key, roleRow(l, match(l.employer, l.location), byKey.get(key), now));
    }
    sourceLinks.push({ key, listing: l });
  }

  const idByKey = new Map<string, number>();
  for (const batch of chunks([...rows.values()], 500)) {
    const { data, error } = await db.from("roles").upsert(batch, { onConflict: "dedupe_key" }).select("id,dedupe_key");
    if (error) throw error;
    for (const r of data) idByKey.set(r.dedupe_key, r.id);
  }

  const links = sourceLinks.map(({ key, listing }) => ({
    source: listing.source,
    source_id: listing.sourceId,
    role_id: idByKey.get(key)!,
    url: listing.sourceUrl,
    first_seen: now,
    last_seen: now,
  }));
  for (const batch of chunks(links, 1000)) {
    const { error } = await db.from("role_sources").upsert(batch, { onConflict: "source,source_id" });
    if (error) throw error;
  }
  return { newRoles: [...rows.keys()].filter((k) => !byKey.has(k)).length, mergedDuplicates: listings.length - rows.size };
}

async function markSeen(source: string, sourceIds: string[]) {
  const now = new Date().toISOString();
  for (const batch of chunks(sourceIds, 200)) {
    const { data, error } = await db
      .from("role_sources")
      .update({ last_seen: now })
      .eq("source", source)
      .in("source_id", batch)
      .select("role_id");
    if (error) throw error;
    const roleIds = [...new Set(data.map((r) => r.role_id))];
    const { error: roleError } = await db.from("roles").update({ last_seen: now, is_open: true }).in("id", roleIds);
    if (roleError) throw roleError;
  }
}

async function closeStaleRoles(): Promise<number> {
  const cutoff = new Date(Date.now() - CLOSE_AFTER_DAYS * 86_400_000).toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const stale = await db.from("roles").update({ is_open: false }).eq("is_open", true).lt("last_seen", cutoff).select("id");
  const expired = await db.from("roles").update({ is_open: false }).eq("is_open", true).lt("expires_at", today).select("id");
  if (stale.error) throw stale.error;
  if (expired.error) throw expired.error;
  return stale.data.length + expired.data.length;
}

// Re-applies tagging and sponsor matching to open roles; only changed rows are written.
async function retag(match: (e: string, l: string | null) => SponsorMatch): Promise<number> {
  type Row = { id: number; title: string; employer: string; location: string | null; description: string | null; tags: unknown; sponsor_status: string | null; sponsor_name: string | null };
  const roles = await selectAll<Row>((from, to) =>
    db.from("roles").select("id,title,employer,location,description,tags,sponsor_status,sponsor_name").eq("is_open", true).order("id").range(from, to),
  );
  let changed = 0;
  for (const r of roles) {
    const tags = tagListing(r.title, r.description ?? "");
    const m = match(r.employer, r.location);
    if (JSON.stringify(tags) === JSON.stringify(r.tags) && m.status === r.sponsor_status && m.name === r.sponsor_name) continue;
    const { error } = await db.from("roles").update({ tags, sponsor_status: m.status, sponsor_name: m.name }).eq("id", r.id);
    if (error) throw error;
    changed++;
  }
  return changed;
}

async function main() {
  const { data: run, error: runError } = await db.from("ingest_runs").insert({ job: "daily" }).select("id").single();
  if (runError) throw runError;
  const stats: Record<string, unknown> = {};

  try {
    const { sponsors, refreshed } = await refreshSponsors(db);
    stats.sponsors = sponsors.length;
    stats.sponsorRegisterRefreshed = refreshed;
    const match = sponsorMatcher(sponsors);
    console.log(`Sponsor register: ${sponsors.length} entries${refreshed ? " (new file loaded)" : ""}`);

    const known = await selectAll<{ source_id: string }>((from, to) =>
      db.from("role_sources").select("source_id").eq("source", "reed").order("source_id").range(from, to),
    );
    const knownIds = new Set(known.map((k) => k.source_id));

    const { results, calls } = await searchReed();
    const newIds = [...results.keys()].filter((id) => !knownIds.has(String(id)));
    console.log(`Reed: ${results.size} roles found (${calls} searches), ${newIds.length} new`);
    const details = await reedDetails(newIds);
    stats.reed = { found: results.size, searches: calls, new: newIds.length, detailCalls: newIds.length };

    const saved = await saveListings(newIds.map((id) => toListing(results.get(id)!, details.get(id))), match);
    await markSeen("reed", [...results.keys()].filter((id) => knownIds.has(String(id))).map(String));
    stats.saved = saved;

    stats.closed = await closeStaleRoles();
    if (retagAll || refreshed) stats.retagged = await retag(match);

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

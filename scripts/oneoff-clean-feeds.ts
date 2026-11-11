// One-off clean-up after the feed fixes of 4 Nov 2026 (delete this file once run).
// Usage: node scripts/oneoff-clean-feeds.ts          shows what would change
//        node scripts/oneoff-clean-feeds.ts --apply  does it
import { adminClient, chunks, must, selectAll } from "./lib/db.ts";
import { loadEnv } from "./lib/env.ts";
import { GRAD_EMPLOYERS, KNOWN_FEEDS } from "./data/gradEmployers.ts";
import { companyKey } from "./lib/normalise.ts";
import { USER_AGENT } from "./lib/employerPages.ts";
import { feedFromUrl, pickSitemap } from "./sources/feeds.ts";

loadEnv();
const db = adminClient();
const apply = process.argv.includes("--apply");

type F = { id: number; company_key: string; name: string; ats: string; ats_id: string; last_found: number | null };
const feeds = await selectAll<F>((from, to) => db.from("employer_feeds").select("id,company_key,name,ats,ats_id,last_found").order("id").range(from, to));

// 1. Sites that belong to someone else, or are job boards rather than employers.
const WRONG = /cms\.gov|rsm\.ac\.uk|hlc\.com|bbc\.com\/afrique|jobs\.lidl\.de|jobs\.jdsports\.de|apple\.com\/shop|tescoplc\.com|home\.barclays|sc\.com\/ae|investec\.com\/en_ae|capgemini\.com\/au-en|phoenixgroup\.eu|allianz\.com\/at\/de|joinrs\.com|joblinkstudent|findapprenticeships|studysmarter|chiropracticjobsonline|hackajob/i;
// 2. A company with a hand-checked sitemap doesn't need guessed ones that find nothing
//    (SAP's guessed one finds 34 roles and the checked one none, so that one stays).
const knownMaps = new Map(KNOWN_FEEDS.filter((k) => k.ats === "sitemap").map((k) => [companyKey(k.name), k.ats_id]));
const removeFeeds = feeds.filter((f) => (f.ats === "sitemap" && WRONG.test(f.ats_id)) || (f.ats === "sitemap" && knownMaps.has(f.company_key) && knownMaps.get(f.company_key) !== f.ats_id && !f.last_found));
console.log(`Feeds to remove: ${removeFeeds.length}`, removeFeeds.map((f) => `${f.name}: ${f.ats_id}`).slice(0, 60));

// 3. Links that kept stray characters or a language folder as the board name.
const repairs: { feed: F; ats_id: string }[] = [];
const removeBroken: F[] = [];
for (const f of feeds.filter((x) => x.ats === "workday")) {
  const [host, , site] = f.ats_id.split("/");
  const fixed = feedFromUrl(`https://${host}/${site}`);
  if (!/^[a-z]{2}-[a-z]{2}$/i.test(site) && fixed && fixed.ats_id !== f.ats_id) repairs.push({ feed: f, ats_id: fixed.ats_id });
  else if (/^[a-z]{2}-[a-z]{2}$/i.test(site)) removeBroken.push(f);
}
console.log("Workday links to repair:", repairs.map((r) => `${r.feed.ats_id} -> ${r.ats_id}`), "remove:", removeBroken.map((f) => f.ats_id));

// 4. Sitemaps pointing at another country's or language's copy of a careers site.
const removed = new Set(removeFeeds.map((f) => f.id));
const have = new Set(feeds.map((f) => `${f.ats}|${f.ats_id}`));
const relocale: { feed: F; ats_id: string }[] = [];
const foreign = feeds.filter((f) => f.ats === "sitemap" && !removed.has(f.id) && (/\/[a-z]{2}\/[a-z]{2}\/|\/[a-z]{2}\/sitemap|\/[a-z]{2}_[a-z]{2}\/|^\//i.test(f.ats_id.replace(/^https?:\/\/[^/]+/, ""))) && !/\/(gb|uk)\/en|\/global\/en|\/en\//i.test(f.ats_id));
for (const f of foreign) {
  try {
    const origin = f.ats_id.startsWith("/") ? null : new URL(f.ats_id).origin;
    if (!origin) continue;
    const res = await fetch(`${origin}/robots.txt`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10_000) });
    const maps = [...(res.ok ? await res.text() : "").matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
    const pick = pickSitemap(maps, origin);
    if (pick && pick !== f.ats_id && !/internal/i.test(pick) && !have.has(`sitemap|${pick}`) && knownMaps.get(f.company_key) !== f.ats_id) relocale.push({ feed: f, ats_id: pick });
  } catch {
    // leave it as it is
  }
}
console.log("Sitemaps to re-point:", relocale.map((r) => `${r.feed.name}: ${r.feed.ats_id} -> ${r.ats_id}`));
const relative = feeds.filter((f) => f.ats === "sitemap" && f.ats_id.startsWith("/"));
console.log("Relative sitemap rows (removed; replaced by a hand-checked feed):", relative.map((f) => f.name));

// 5. Seed employers marked "nothing found": look again now the search is fixed.
const seeds = new Set(GRAD_EMPLOYERS.map(companyKey));
const noneRows = feeds.filter((f) => f.ats === "none" && seeds.has(f.company_key));
console.log("Seed employers to look for again:", noneRows.length);

// 6. Roles read from sitemaps under the old rules (id for a title, no place, often abroad):
//    only those no other source lists. The next run re-reads them with the proper checks.
const links = await selectAll<{ role_id: number; source: string; source_id: string }>((from, to) => db.from("role_sources").select("role_id,source,source_id").eq("source", "employer").like("source_id", "sitemap:%").order("source_id").range(from, to));
const roleIds = [...new Set(links.map((l) => l.role_id))];
const roles: { id: number; title: string; employer: string; location: string | null; sources: string[] }[] = [];
for (const batch of chunks(roleIds, 200)) roles.push(...(await must(() => db.from("roles").select("id,title,employer,location,sources").in("id", batch))) as typeof roles);
// Never touch a role someone has saved or is applying for.
const inUse = new Set((await selectAll<{ role_id: number }>((from, to) => db.from("saved_roles").select("role_id").order("role_id").range(from, to))).map((r) => r.role_id));
const bad = roles.filter((r) => !inUse.has(r.id) && r.sources.length === 1 && (!r.location || /^\s*[A-Z]?\d{4,}\s*$/.test(r.title)));
console.log(`Sitemap-read roles to re-read: ${bad.length} of ${roles.length}`, bad.slice(0, 12).map((r) => `${r.employer}: ${r.title}`));
// Today's morning job ruled these out under the new rules; only earlier decisions are forgotten.
const FIXED_RULES_FROM = "2026-11-04T12:00:00Z";
const { count: oldExcluded } = await db.from("excluded_listings").select("source_id", { count: "exact", head: true }).eq("source", "employer").like("source_id", "sitemap:%").lt("last_seen", FIXED_RULES_FROM);
console.log("Old sitemap rule-outs to forget:", oldExcluded);

if (apply) {
  const del = [...removeFeeds, ...removeBroken, ...noneRows, ...relative].map((f) => f.id);
  for (const batch of chunks(del, 200)) await must(() => db.from("employer_feeds").delete().in("id", batch));
  for (const r of [...repairs, ...relocale]) {
    const clash = await must(() => db.from("employer_feeds").select("id").eq("ats", r.feed.ats).eq("ats_id", r.ats_id));
    if ((clash as unknown[]).length) await must(() => db.from("employer_feeds").delete().eq("id", r.feed.id));
    else await must(() => db.from("employer_feeds").update({ ats_id: r.ats_id, last_status: null, last_found: null }).eq("id", r.feed.id));
  }
  for (const batch of chunks(bad.map((r) => r.id), 200)) await must(() => db.from("roles").delete().in("id", batch));
  await must(() => db.from("excluded_listings").delete().eq("source", "employer").like("source_id", "sitemap:%").lt("last_seen", FIXED_RULES_FROM));
  console.log("Applied.");
} else console.log("Dry run: nothing changed. Add --apply to do it.");

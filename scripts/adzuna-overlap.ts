// One-off test: how many graduate roles does Adzuna list that we don't already have?
// Uses Adzuna's free test calls only, with a hard cap stored in the api_usage table.
// Run with `npm run adzuna-test`. Results are logged to ingest_runs, nothing is added to the feed.

import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, selectAll } from "./lib/db.ts";
import { loadEnv, requireEnv } from "./lib/env.ts";
import { knownRoleIndex } from "./lib/match.ts";
import { htmlToText } from "./lib/normalise.ts";

loadEnv();
const db = adminClient();

// 20 calls, leaving 5 spare. 50 results per call.
const PLAN: { what: string; pages: number }[] = [
  { what: "graduate", pages: 10 },
  { what: "graduate scheme", pages: 4 },
  { what: "graduate programme", pages: 3 },
  { what: "entry level", pages: 3 },
];

type AdzunaJob = {
  id: string;
  title: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  redirect_url: string;
};

// Claims one call from the budget before making it; refuses once the cap is reached.
async function claimCall(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.from("api_usage").select("calls_used,call_cap").eq("provider", "adzuna").single();
  if (error) throw error;
  if (data.calls_used >= data.call_cap) return false;
  const { error: updateError } = await client
    .from("api_usage")
    .update({ calls_used: data.calls_used + 1 })
    .eq("provider", "adzuna")
    .eq("calls_used", data.calls_used);
  if (updateError) throw updateError;
  return true;
}

async function main() {
  const appId = requireEnv("ADZUNA_APP_ID");
  const appKey = requireEnv("ADZUNA_APP_KEY");

  const roles = await selectAll<{ id: number; employer: string; title: string }>((from, to) =>
    db.from("roles").select("id,employer,title").eq("is_open", true).order("id").range(from, to),
  );
  const weHaveIt = knownRoleIndex(roles);

  const seen = new Map<string, AdzunaJob>();
  let calls = 0;
  outer: for (const { what, pages } of PLAN) {
    for (let page = 1; page <= pages; page++) {
      if (!(await claimCall(db))) {
        console.log("Adzuna call cap reached; stopping.");
        break outer;
      }
      const params = new URLSearchParams({ app_id: appId, app_key: appKey, results_per_page: "50", what, max_days_old: "30" });
      const res = await fetch(`https://api.adzuna.com/v1/api/jobs/gb/search/${page}?${params}`);
      calls++;
      if (!res.ok) throw new Error(`Adzuna returned ${res.status}`);
      const body = (await res.json()) as { results: AdzunaJob[] };
      for (const job of body.results) seen.set(job.id, job);
      if (body.results.length < 50) break;
    }
  }

  const jobs = [...seen.values()].map((j) => ({
    title: htmlToText(j.title),
    employer: j.company?.display_name?.trim() ?? "",
    location: j.location?.display_name ?? null,
    url: j.redirect_url,
  }));
  const missing = jobs.filter((j) => j.employer && weHaveIt(j.employer, j.title) === null);
  const looksGrad = (t: string) => /graduate|trainee|entry[- ]level|junior|2027|apprentice|placement/i.test(t);
  const missingGrad = missing.filter((j) => looksGrad(j.title));

  const stats = {
    calls,
    adzunaRoles: jobs.length,
    alreadyHave: jobs.length - missing.length,
    missing: missing.length,
    missingPct: Math.round((missing.length / Math.max(1, jobs.length)) * 100),
    missingGradTitled: missingGrad.length,
    sampleMissing: missingGrad.slice(0, 25).map((j) => `${j.title} | ${j.employer} | ${j.location}`),
  };
  await db.from("ingest_runs").insert({ job: "adzuna-overlap-test", finished_at: new Date().toISOString(), stats });
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { adminClient } from "./lib/db.ts";
import { loadEnv } from "./lib/env.ts";
loadEnv();
const db = adminClient();
const start = (await db.from("ingest_runs").select("id").order("id", { ascending: false }).limit(1)).data?.[0]?.id ?? 0;
for (let i = 0; i < 90; i++) {
  try {
    const { data } = await db.from("ingest_runs").select("id,finished_at,stats,error").gte("id", start).order("id", { ascending: false }).limit(1);
    const r = data?.[0];
    if (r && r.id >= start && r.finished_at && i > 0) { console.log(JSON.stringify(r)); process.exit(0); }
  } catch {}
  await new Promise((res) => setTimeout(res, 120_000));
}
console.log("timeout");

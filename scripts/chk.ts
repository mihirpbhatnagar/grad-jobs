import { loadEnv } from "./lib/env.ts";
import { adminClient, selectAll } from "./lib/db.ts";
import { domainFor } from "./lib/companies.ts";
loadEnv();
const db = adminClient();
const rows = await selectAll<{ key: string; name: string }>((a, b) => db.from("companies").select("key,name").is("domain", null).is("logo_url", null).order("key").range(a, b));
let found = 0;
for (const r of rows) {
  const d = await domainFor(r.name);
  if (d) { found++; await db.from("companies").update({ domain: d, website: `https://${d}` }).eq("key", r.key); }
  await new Promise((res) => setTimeout(res, 120));
}
console.log(`checked ${rows.length}, websites found ${found}`);

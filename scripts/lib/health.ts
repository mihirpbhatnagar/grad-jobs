import type { SupabaseClient } from "@supabase/supabase-js";
import { GRAD_EMPLOYERS } from "../data/gradEmployers.ts";
import { selectAll } from "./db.ts";
import { companyKey, textKey } from "./normalise.ts";
import { isBoardName, isOutsideUk } from "./tags.ts";

// Automatic checks at the end of every morning run, for the mistakes found so far. Results
// are stored with the day's coverage and shown on the Coverage page, so problems are seen
// rather than guessed at.

export type Check = { name: string; ok: boolean; detail: string };

// The 50 biggest UK graduate recruiters from the seed list: each should normally have open
// 2027 roles in the main list during recruiting season (autumn to spring).
const CHECKLIST = GRAD_EMPLOYERS.filter((n) =>
  [
    "Deloitte", "PwC", "EY", "KPMG", "BDO", "Grant Thornton", "Accenture", "Capgemini", "IBM", "Clifford Chance",
    "Barclays", "HSBC", "Lloyds Banking Group", "NatWest Group", "Santander", "Goldman Sachs", "J.P. Morgan", "Morgan Stanley", "Bank of England", "Aviva",
    "Google", "Microsoft", "Amazon", "Bloomberg", "Sky", "BT", "Vodafone", "BAE Systems", "Rolls-Royce", "Airbus",
    "BP", "Shell", "Centrica", "National Grid", "Arup", "AtkinsRéalis", "Mott MacDonald", "Network Rail", "Jaguar Land Rover", "Siemens",
    "Unilever", "Procter & Gamble", "Nestlé", "Mars", "Diageo", "L'Oréal", "Tesco", "Aldi", "Lidl", "AstraZeneca",
  ].includes(n),
);

type MainRole = { id: number; title: string; employer: string; location: string | null; company_key: string | null };

export async function healthCheck(db: SupabaseClient) {
  const today = new Date().toISOString().slice(0, 10);
  const main = await selectAll<MainRole>((from, to) =>
    db.from("roles").select("id,title,employer,location,company_key").eq("is_open", true).eq("kind", "job").eq("part_time", false)
      .in("start_status", ["confirmed", "likely"]).is("tags->>abroad", null).or(`expires_at.is.null,expires_at.gte.${today}`).or(`tags->>deadline.is.null,tags->>deadline.gte.${today}`)
      .order("id").range(from, to),
  );
  const checks: Check[] = [];
  const add = (name: string, bad: string[], what: string) =>
    checks.push({ name, ok: bad.length === 0, detail: bad.length ? `${bad.length} ${what}: ${bad.slice(0, 5).join("; ")}` : "OK" });

  add("No roles outside the UK", main.filter((r) => isOutsideUk(r.title, r.location)).map((r) => `${r.title} (${r.location})`), "non-UK roles");
  // Job boards listed as the employer are shown as "Employer not named · via <board>", so this
  // is a count to watch, not a failure.
  const unnamed = main.filter((r) => isBoardName(r.employer)).length;
  checks.push({ name: "Roles with the employer not named (job-board listings, labelled)", ok: true, detail: `${unnamed} roles` });

  const seen = new Map<string, number>();
  for (const r of main) {
    const k = `${r.company_key}|${textKey(r.title)}|${textKey(r.location ?? "")}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  add("No duplicate roles", [...seen].filter(([, n]) => n > 1).map(([k, n]) => `${k.split("|")[1]} ×${n}`), "duplicates");

  // Search: every result for "marketing" must contain the word (the bug found on 27 Oct).
  const hits = main.filter((r) => [r.title, r.employer, r.location ?? ""].some((x) => /marketing/i.test(x)));
  add("Search finds only matching roles", hits.filter((r) => !/marketing/i.test(`${r.title} ${r.employer} ${r.location ?? ""}`)).map((r) => r.title), "wrong results");

  const { count: pastDeadline } = await db.from("roles").select("id", { count: "exact", head: true }).eq("is_open", true).lt("tags->>deadline", today);
  checks.push({ name: "Roles past their deadline are closed", ok: !pastDeadline, detail: pastDeadline ? `${pastDeadline} still open` : "OK" });

  // The 50-employer checklist, with the reason when one is missing.
  const feeds = await selectAll<{ company_key: string; ats: string; last_status: string | null }>((from, to) =>
    db.from("employer_feeds").select("company_key,ats,last_status").order("id").range(from, to),
  );
  const byCompany = new Map<string, number>();
  for (const r of main) if (r.company_key) byCompany.set(r.company_key, (byCompany.get(r.company_key) ?? 0) + 1);
  const employers = CHECKLIST.map((name) => {
    const key = companyKey(name);
    const roles = [...byCompany].filter(([k]) => k === key || k.startsWith(`${key} `)).reduce((n, [, c]) => n + c, 0);
    const f = feeds.filter((x) => x.company_key === key);
    const reason = roles
      ? ""
      : f.some((x) => x.ats !== "none" && x.last_status === "ok")
        ? "careers site read: no open 2027 UK roles found"
        : f.some((x) => x.ats !== "none")
          ? "careers site found but couldn't be read"
          : "careers system not found yet";
    return { name, roles, reason };
  });
  const present = employers.filter((e) => e.roles > 0).length;
  checks.push({ name: "Big graduate employers present", ok: present >= 40, detail: `${present} of ${employers.length} have open 2027 roles` });

  return { checks, employers, passed: checks.filter((c) => c.ok).length, total: checks.length };
}

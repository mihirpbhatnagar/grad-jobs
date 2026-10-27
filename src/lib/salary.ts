import { cacheLife } from "next/cache";
import { FIELDS } from "./profile";
import { publicClient } from "./supabase";

// Salary context from the roles in the app itself (free): the typical salary for similar
// 2027 graduate roles, used as an estimate when a listing doesn't state one.

export type SalaryContext = { overall: number | null; byField: Record<string, { median: number; count: number }> };

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export function fieldOf(title: string): (typeof FIELDS)[number] | null {
  const t = ` ${title.toLowerCase()} `;
  return FIELDS.find((f) => f.keywords.some((k) => t.includes(k))) ?? null;
}

export async function salaryContext(): Promise<SalaryContext> {
  "use cache";
  cacheLife("hours");
  const db = publicClient();
  if (!db) return { overall: null, byField: {} };
  const { data } = await db
    .from("roles")
    .select("title,salary_min,salary_max")
    .eq("is_open", true)
    .eq("kind", "job")
    .eq("part_time", false)
    .in("start_status", ["confirmed", "likely"])
    .or("salary_min.gte.15000,salary_max.gte.15000")
    .limit(3000);
  const pays: { title: string; pay: number }[] = [];
  for (const r of data ?? []) {
    const lo = r.salary_min ?? r.salary_max;
    const hi = r.salary_max ?? r.salary_min;
    const pay = Math.round(((lo ?? 0) + (hi ?? 0)) / 2);
    if (pay >= 15000 && pay <= 120000) pays.push({ title: r.title, pay });
  }
  const byField: SalaryContext["byField"] = {};
  for (const f of FIELDS) {
    const xs = pays.filter((p) => fieldOf(p.title)?.id === f.id).map((p) => p.pay);
    const m = median(xs);
    if (m && xs.length >= 3) byField[f.id] = { median: m, count: xs.length };
  }
  return { overall: median(pays.map((p) => p.pay)), byField };
}

// Estimated salary for a role without one: the median for its field, else for all roles.
export function estimateFor(title: string, ctx: SalaryContext): { amount: number; basis: string } | null {
  const f = fieldOf(title);
  const hit = f ? ctx.byField[f.id] : undefined;
  if (hit) return { amount: hit.median, basis: `typical for ${f!.label.toLowerCase()} roles here` };
  return ctx.overall ? { amount: ctx.overall, basis: "typical for 2027 graduate roles here" } : null;
}

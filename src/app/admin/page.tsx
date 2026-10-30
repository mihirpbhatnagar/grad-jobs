import { connection } from "next/server";
import { Suspense } from "react";
import { PageBand } from "@/components/SectionIntro";
import { publicClient } from "@/lib/supabase";

type Coverage = {
  mainList: number;
  employersWatched: number;
  rolesAtWatchedEmployers: number;
  foundByEmployerFeeds: number;
  coveragePct: number | null;
  googleOnlyPct: number | null;
  bySource: Record<string, number>;
  safetyStop?: string;
  linkedIn?: { seen: number; alreadyHad: number; added: number; pct: number | null };
  health?: { checks: { name: string; ok: boolean; detail: string }[]; employers: { name: string; roles: number; reason: string }[]; passed: number; total: number };
};

function Big({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

async function CoverageView() {
  await connection();
  const db = publicClient();
  const { data } = db ? await db.from("coverage_daily").select("day,stats").order("day", { ascending: false }).limit(30) : { data: null };
  const days = (data ?? []) as { day: string; stats: Coverage }[];
  const today = days[0]?.stats;
  if (!today) return <p className="text-muted">No coverage recorded yet. It is worked out at the end of each morning&apos;s run.</p>;
  const sources = [
    ["Employer's own site", today.bySource.employer ?? 0],
    ["Reed", today.bySource.reed ?? 0],
    ["Google Jobs", today.bySource.google_jobs ?? 0],
  ] as const;
  const max = Math.max(...sources.map(([, n]) => n), 1);
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Big label="Coverage score" value={today.coveragePct === null ? "–" : `${today.coveragePct}%`} sub="Roles at watched employers also found on their own site" />
        <Big label="Employers watched" value={today.employersWatched.toLocaleString("en-GB")} sub="Read directly every morning" />
        <Big label="Found only by Google Jobs" value={today.googleOnlyPct === null ? "–" : `${today.googleOnlyPct}%`} sub="Roles no other source had" />
        <Big label="Main list" value={today.mainList.toLocaleString("en-GB")} sub="Full-time, starting June 2027+" />
      </div>
      {today.safetyStop && (
        <section className="rounded-2xl border border-rose/40 bg-rose-soft p-5 text-rose">
          <h2 className="font-semibold">Safety stop this morning</h2>
          <p className="mt-1 text-sm">{today.safetyStop}</p>
        </section>
      )}
      {today.linkedIn && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-semibold tracking-tight">LinkedIn check</h2>
          <p className="mt-1 text-sm text-muted">Graduate roles Google Jobs shows &ldquo;via LinkedIn&rdquo;, checked against what the app already had.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Big label="Already in the app" value={today.linkedIn.pct === null ? "–" : `${today.linkedIn.pct}%`} sub={`${today.linkedIn.alreadyHad} of ${today.linkedIn.seen} LinkedIn roles`} />
            <Big label="LinkedIn roles seen" value={String(today.linkedIn.seen)} sub="In today's Google Jobs searches" />
            <Big label="Added from LinkedIn" value={String(today.linkedIn.added)} sub="Missing before; now in the app" />
          </div>
        </section>
      )}
      {today.health && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-semibold tracking-tight">
            Health check · {today.health.passed}/{today.health.total} passed
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {today.health.checks.map((c) => (
              <li key={c.name} className="flex gap-3">
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${c.ok ? "bg-success-soft text-success" : "bg-rose-soft text-rose"}`}>{c.ok ? "✓" : "!"}</span>
                <span>
                  <span className="font-medium">{c.name}</span>
                  {!c.ok && <span className="block text-muted">{c.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
          <h3 className="mt-6 text-sm font-semibold">Big graduate employers</h3>
          <div className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {today.health.employers.map((e) => (
              <div key={e.name} className="flex justify-between gap-3 border-b border-border py-1.5">
                <span className={e.roles ? "" : "text-muted"}>{e.name}</span>
                <span className={`text-right ${e.roles ? "font-semibold tabular-nums" : "text-xs text-muted"}`}>{e.roles || e.reason}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-semibold tracking-tight">Where main-list roles were found</h2>
        <div className="mt-4 space-y-3">
          {sources.map(([label, n]) => (
            <div key={label}>
              <div className="flex justify-between text-sm">
                <span>{label}</span>
                <span className="font-semibold tabular-nums">{n.toLocaleString("en-GB")}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-chip">
                <div className="h-2 rounded-full bg-accent" style={{ width: `${(n / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">A role can be found by more than one source.</p>
      </section>
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-semibold tracking-tight">Last 30 days</h2>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1.5 font-medium">Day</th>
              <th className="py-1.5 font-medium">Main list</th>
              <th className="py-1.5 font-medium">Coverage</th>
              <th className="py-1.5 font-medium">Google only</th>
              <th className="py-1.5 font-medium">Watched</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {days.map((d) => (
              <tr key={d.day}>
                <td className="py-1.5">{new Date(d.day).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                <td>{d.stats.mainList}</td>
                <td>{d.stats.coveragePct ?? "–"}%</td>
                <td>{d.stats.googleOnlyPct ?? "–"}%</td>
                <td>{d.stats.employersWatched}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// Data health: the daily coverage score from the brief, and where roles come from.
export default function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 pb-24 pt-6 sm:px-6">
      <PageBand title="Coverage" lead="How much of the UK graduate market the app is catching, checked every morning." />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-chip" />}>
        <CoverageView />
      </Suspense>
    </main>
  );
}

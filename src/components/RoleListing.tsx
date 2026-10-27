import { ukToday, weekAhead } from "@/lib/format";
import Link from "next/link";
import { connection } from "next/server";
import { FilterBar } from "@/components/FilterBar";
import { RoleCard } from "@/components/RoleCard";
import { currentUser } from "@/lib/auth";
import { withDefaults } from "@/lib/profile";
import { activeFilterCount, fetchRoles, filtersToQuery, PAGE_SIZE, parseFilters, type RoleFilters, type RoleScope } from "@/lib/roles";
import { publicClient } from "@/lib/supabase";

function updatedLabel(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  const sameDay = d.toDateString() === new Date().toDateString();
  return `Updated ${sameDay ? "today" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at ${time}`;
}

// Headline numbers for the main list.
async function mainStats() {
  const db = publicClient();
  if (!db) return null;
  const today = ukToday();
  const base = () =>
    db.from("roles").select("id", { count: "exact", head: true }).eq("is_open", true).eq("kind", "job").eq("part_time", false)
      .in("start_status", ["confirmed", "likely"]).or(`expires_at.is.null,expires_at.gte.${today}`).or(`tags->>deadline.is.null,tags->>deadline.gte.${today}`);
  const week = weekAhead();
  const [sept, closing, sponsors, schemes] = await Promise.all([
    base().gte("tags->>startDate", "2027-09-01").lt("tags->>startDate", "2027-10-01"),
    base().or(`expires_at.lte.${week},tags->>deadline.lte.${week}`),
    base().eq("sponsor_status", "likely"),
    base().eq("tags->>graduateScheme", "true"),
  ]);
  return { sept: sept.count ?? 0, closing: closing.count ?? 0, sponsors: sponsors.count ?? 0, schemes: schemes.count ?? 0 };
}

function Stat({ value, label, href }: { value: number; label: string; href: string }) {
  return (
    <Link href={href} scroll={false} className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15 transition-colors hover:bg-white/15">
      <div className="text-2xl font-semibold tabular-nums tracking-tight">{value.toLocaleString("en-GB")}</div>
      <div className="text-xs text-white/75">{label}</div>
    </Link>
  );
}

// A full role list with the brand header, search, filters and paging. Used by All roles,
// Internships and Part-time.
export async function RoleListing({
  searchParams,
  scope,
  path,
  title,
  lead,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  scope: RoleScope;
  path: string;
  title: string;
  lead: (total: number, f: RoleFilters) => string;
}) {
  await connection();
  const f = parseFilters(await searchParams);
  const { db, user } = await currentUser();
  // Internships default to the user's own fields (plus events, which are always relevant).
  let fieldsDefault = false;
  if (scope === "internships" && user && f.sectors.length === 0) {
    const { data: profile } = await db.from("profiles").select("answers").maybeSingle();
    const fields = withDefaults(profile?.answers).fields.value;
    if (fields.length) {
      f.sectors = [...new Set([...fields, "events"])];
      fieldsDefault = true;
    }
  }
  const [result, stats] = await Promise.all([fetchRoles(f, scope), scope === "main" ? mainStats() : null]);
  const savedIds = new Set<number>();
  if (user && result?.roles.length) {
    const { data } = await db.from("saved_roles").select("role_id").in("role_id", result.roles.map((r) => r.id));
    for (const row of data ?? []) savedIds.add(row.role_id);
  }
  const pages = result ? Math.ceil(result.total / PAGE_SIZE) : 0;

  // Profile answers whose "Use in For you" switch is off become one-tap filters here.
  // (Fields always get a "My fields" button in the filters instead.)
  const myChips: { label: string; href: string }[] = [];
  let myFields: string[] = [];
  if (user) {
    const { data: profile } = await db.from("profiles").select("answers").maybeSingle();
    const a = withDefaults(profile?.answers);
    myFields = a.fields.value;
    const places = [...a.locations.value, ...a.locations.other.split(",").map((x) => x.trim()).filter(Boolean)];
    if (!a.locations.forYou && places.length) myChips.push({ label: "My locations", href: filtersToQuery(f, { locs: places }, path) });
    if (!a.salary.forYou && a.salary.value) myChips.push({ label: "My salary", href: filtersToQuery(f, { salary: a.salary.value }, path) });
    if (!a.sponsors.forYou && a.sponsors.value) myChips.push({ label: "Licensed sponsors", href: filtersToQuery(f, { sponsor: "likely" }, path) });
  }

  return (
    <>
      <section className="brand-band relative overflow-hidden rounded-3xl px-5 pb-6 pt-7 text-white shadow-xl shadow-indigo-950/20 sm:px-8 sm:pt-9">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-white/80">
          {result ? lead(result.total, f) : "Connecting to the role database…"}
          {fieldsDefault && <span className="text-white/80"> · in your fields</span>}
          {result?.updatedAt && <span className="text-white/60"> · {updatedLabel(result.updatedAt)}</span>}
        </p>
        {stats && (
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat value={stats.closing} label="Closing this week" href={filtersToQuery(f, { closingSoon: true, sort: "closing" }, path)} />
            <Stat value={stats.sept} label="Starting September 2027" href={filtersToQuery(f, { start: "sept" }, path)} />
            <Stat value={stats.schemes} label="Graduate schemes" href={filtersToQuery(f, { schemes: true }, path)} />
            <Stat value={stats.sponsors} label="Licensed sponsors" href={filtersToQuery(f, { sponsor: "likely" }, path)} />
          </div>
        )}
        <div className="mt-6">
          <FilterBar filters={f} path={path} showStart={scope === "main"} myFields={myFields} />
        </div>
        {myChips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-white/70">From your profile:</span>
            {myChips.map((c) => (
              <Link key={c.label} href={c.href} scroll={false} className="rounded-full bg-white px-3 py-1 font-semibold text-accent hover:opacity-90">
                {c.label}
              </Link>
            ))}
          </div>
        )}
      </section>

      {result && (f.q || activeFilterCount(f) > 0) && (
        <p className="mt-6 text-sm text-muted">
          Found <span className="font-semibold text-foreground">{result.total.toLocaleString("en-GB")}</span> result{result.total === 1 ? "" : "s"}
          {f.q && (
            <>
              {" "}for <span className="font-semibold text-foreground">&ldquo;{f.q}&rdquo;</span>
            </>
          )}
          {activeFilterCount(f) > 0 && ` with ${activeFilterCount(f)} filter${activeFilterCount(f) === 1 ? "" : "s"}`}
        </p>
      )}
      <section className={`space-y-3 ${result && (f.q || activeFilterCount(f) > 0) ? "mt-3" : "mt-6"}`}>
        {result?.roles.map((role) => (
          <RoleCard
            key={role.id}
            role={role}
            company={role.company_key ? result.companies.get(role.company_key) : null}
            saved={savedIds.has(role.id)}
            signedIn={!!user}
          />
        ))}
        {result && result.roles.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center text-muted">
            No roles match. Try fewer words or clear a filter.
          </div>
        )}
      </section>

      {pages > 1 && (
        <nav className="mt-8 flex items-center justify-between text-sm">
          {f.page > 1 ? (
            <Link href={filtersToQuery(f, { page: f.page - 1 }, path)} className="rounded-xl border border-border bg-surface px-4 py-2 font-medium hover:border-accent/50">
              ← Previous
            </Link>
          ) : <span />}
          <span className="text-muted">Page {f.page} of {pages}</span>
          {f.page < pages ? (
            <Link href={filtersToQuery(f, { page: f.page + 1 }, path)} className="rounded-xl border border-border bg-surface px-4 py-2 font-medium hover:border-accent/50">
              Next →
            </Link>
          ) : <span />}
        </nav>
      )}
    </>
  );
}

export function ListingSkeleton() {
  return (
    <div aria-hidden className="animate-pulse">
      <div className="brand-band h-72 rounded-3xl opacity-80" />
      <div className="mt-6 space-y-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-40 rounded-2xl bg-chip" />)}
      </div>
    </div>
  );
}

import Link from "next/link";
import { Suspense } from "react";
import { RoleCard } from "@/components/RoleCard";
import { SidePanel } from "@/components/SidePanel";
import { currentUser } from "@/lib/auth";
import { FilterBar } from "@/components/FilterBar";
import { withDefaults } from "@/lib/profile";
import { fetchRoles, filtersToQuery, PAGE_SIZE, parseFilters } from "@/lib/roles";

function Chip({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} scroll={false} className="whitespace-nowrap rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs font-medium text-accent hover:opacity-80">
      {children}
    </Link>
  );
}

function updatedLabel(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  const sameDay = d.toDateString() === new Date().toDateString();
  return `Updated ${sameDay ? "today" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at ${time}`;
}

export default function Home(props: PageProps<"/">) {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <h1 className="pt-8 text-3xl font-semibold tracking-tight">All roles</h1>
        <Suspense fallback={<RolesSkeleton />}>
          <Roles searchParams={props.searchParams} />
        </Suspense>

        <footer className="mt-16 text-xs text-muted">
          Listings from <a href="https://www.reed.co.uk" className="underline underline-offset-2">reed.co.uk</a> and Google
          Jobs. Sponsor status is from the Home Office register of licensed sponsors and is information only.
        </footer>
      </div>

      <aside className="hidden pt-8 lg:block">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-chip" />}>
          <SidePanel />
        </Suspense>
      </aside>
    </div>
  );
}

function RolesSkeleton() {
  return (
    <div aria-hidden className="animate-pulse">
      <div className="mt-3 h-5 w-72 rounded bg-chip" />
      <div className="mt-6 h-[54px] rounded-2xl bg-chip" />
      <div className="mt-4 flex gap-2">
        {[96, 128, 112, 124].map((w) => <div key={w} style={{ width: w }} className="h-8 rounded-full bg-chip" />)}
      </div>
      <div className="mt-8 space-y-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-36 rounded-2xl bg-chip" />)}
      </div>
    </div>
  );
}

async function Roles({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const f = parseFilters(await searchParams);
  const [result, { db, user }] = await Promise.all([fetchRoles(f), currentUser()]);
  const savedIds = new Set<number>();
  if (user && result?.roles.length) {
    const { data } = await db.from("saved_roles").select("role_id").in("role_id", result.roles.map((r) => r.id));
    for (const row of data ?? []) savedIds.add(row.role_id);
  }
  const pages = result ? Math.ceil(result.total / PAGE_SIZE) : 0;

  // Profile answers whose "Use in For you" switch is off become one-tap filters here.
  const myChips: React.ReactNode[] = [];
  if (user) {
    const { data: profile } = await db.from("profiles").select("answers").maybeSingle();
    const a = withDefaults(profile?.answers);
    if (!a.fields.forYou && a.fields.value.length) myChips.push(<Chip key="f" href={filtersToQuery(f, { sectors: a.fields.value })}>My sectors</Chip>);
    const places = [...a.locations.value, ...a.locations.other.split(",").map((x) => x.trim()).filter(Boolean)];
    if (!a.locations.forYou && places.length) myChips.push(<Chip key="l" href={filtersToQuery(f, { locs: places })}>My locations</Chip>);
    if (!a.salary.forYou && a.salary.value) myChips.push(<Chip key="s" href={filtersToQuery(f, { salary: a.salary.value })}>My salary</Chip>);
    if (!a.sponsors.forYou && a.sponsors.value) myChips.push(<Chip key="sp" href={filtersToQuery(f, { sponsor: "likely" })}>Sponsors only</Chip>);
  }

  return (
    <>
      <section>
        <p className="mt-2 text-muted">
          {result
            ? `${result.total.toLocaleString("en-GB")} UK graduate roles starting June 2027 or later. ${updatedLabel(result.updatedAt)}`
            : "Connecting to the role database…"}
        </p>

        <form action="/" className="mt-6">
          {[...new URLSearchParams(filtersToQuery(f, { q: "" }).slice(2))].map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus-within:border-foreground/40">
            <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="9" cy="9" r="6" />
              <path d="m14 14 4 4" strokeLinecap="round" />
            </svg>
            <input
              name="q"
              defaultValue={f.q}
              placeholder="Search job title, company or town"
              className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted"
            />
            <button type="submit" className="rounded-xl bg-foreground px-4 py-1.5 text-sm font-medium text-background">
              Search
            </button>
          </label>
        </form>

        <FilterBar filters={f} />
        {myChips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">From your profile:</span>
            {myChips}
          </div>
        )}
      </section>

      <section className="mt-8 space-y-3">
        {result?.roles.map((role) => <RoleCard key={role.id} role={role} saved={savedIds.has(role.id)} signedIn={!!user} />)}
        {result && result.roles.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
            No roles match. Try fewer words or clear a filter.
          </div>
        )}
      </section>

      {pages > 1 && (
        <nav className="mt-8 flex items-center justify-between text-sm">
          {f.page > 1 ? (
            <Link href={filtersToQuery(f, { page: f.page - 1 })} className="rounded-full border border-border bg-surface px-4 py-2 hover:border-foreground/30">
              ← Previous
            </Link>
          ) : <span />}
          <span className="text-muted">Page {f.page} of {pages}</span>
          {f.page < pages ? (
            <Link href={filtersToQuery(f, { page: f.page + 1 })} className="rounded-full border border-border bg-surface px-4 py-2 hover:border-foreground/30">
              Next →
            </Link>
          ) : <span />}
        </nav>
      )}
    </>
  );
}

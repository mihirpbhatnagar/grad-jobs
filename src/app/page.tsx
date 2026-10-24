import Link from "next/link";
import { Suspense } from "react";
import { RoleCard } from "@/components/RoleCard";
import { fetchRoles, PAGE_SIZE, parseFilters, type RoleFilters } from "@/lib/roles";

// Builds a link to this page with some filters changed (and back to page 1).
function hrefWith(f: RoleFilters, changes: Partial<RoleFilters>): string {
  const next = { ...f, page: 1, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.sponsor) params.set("sponsor", next.sponsor);
  if (next.schemes) params.set("schemes", "1");
  if (next.sort !== "newest") params.set("sort", next.sort);
  if (next.page > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-surface text-foreground/80 hover:border-foreground/30"
      }`}
    >
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
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-6">
      <header className="flex items-center gap-3 py-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft font-semibold text-accent">G</span>
        <span className="font-semibold tracking-tight">Grad Jobs</span>
      </header>

      <h1 className="pt-6 text-3xl font-semibold tracking-tight">All roles</h1>
      <Suspense fallback={<RolesSkeleton />}>
        <Roles searchParams={props.searchParams} />
      </Suspense>

      <footer className="mt-16 text-xs text-muted">
        Listings from <a href="https://www.reed.co.uk" className="underline underline-offset-2">reed.co.uk</a>. Sponsor
        status is from the Home Office register of licensed sponsors and is information only.
      </footer>
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
  const result = await fetchRoles(f);
  const pages = result ? Math.ceil(result.total / PAGE_SIZE) : 0;

  return (
    <>
      <section>
        <p className="mt-2 text-muted">
          {result
            ? `${result.total.toLocaleString("en-GB")} open UK graduate and entry-level roles. ${updatedLabel(result.updatedAt)}`
            : "Connecting to the role database…"}
        </p>

        <form action="/" className="mt-6">
          {f.sponsor && <input type="hidden" name="sponsor" value={f.sponsor} />}
          {f.schemes && <input type="hidden" name="schemes" value="1" />}
          {f.sort !== "newest" && <input type="hidden" name="sort" value={f.sort} />}
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

        <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <FilterChip href={hrefWith(f, { sponsor: "" })} active={!f.sponsor}>All employers</FilterChip>
          <FilterChip href={hrefWith(f, { sponsor: "likely" })} active={f.sponsor === "likely"}>Licensed sponsors</FilterChip>
          <FilterChip href={hrefWith(f, { sponsor: "unclear" })} active={f.sponsor === "unclear"}>Sponsor unclear</FilterChip>
          <FilterChip href={hrefWith(f, { schemes: !f.schemes })} active={f.schemes}>Graduate schemes</FilterChip>
          <span className="mx-1 hidden w-px bg-border sm:block" />
          <FilterChip href={hrefWith(f, { sort: "newest" })} active={f.sort === "newest"}>Newest</FilterChip>
          <FilterChip href={hrefWith(f, { sort: "closing" })} active={f.sort === "closing"}>Closing soon</FilterChip>
        </div>
      </section>

      <section className="mt-8 space-y-3">
        {result?.roles.map((role) => <RoleCard key={role.id} role={role} />)}
        {result && result.roles.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
            No roles match. Try fewer words or clear a filter.
          </div>
        )}
      </section>

      {pages > 1 && (
        <nav className="mt-8 flex items-center justify-between text-sm">
          {f.page > 1 ? (
            <Link href={hrefWith(f, { page: f.page - 1 })} className="rounded-full border border-border bg-surface px-4 py-2 hover:border-foreground/30">
              ← Previous
            </Link>
          ) : <span />}
          <span className="text-muted">Page {f.page} of {pages}</span>
          {f.page < pages ? (
            <Link href={hrefWith(f, { page: f.page + 1 })} className="rounded-full border border-border bg-surface px-4 py-2 hover:border-foreground/30">
              Next →
            </Link>
          ) : <span />}
        </nav>
      )}
    </>
  );
}

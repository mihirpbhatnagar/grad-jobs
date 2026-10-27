import Link from "next/link";
import { connection } from "next/server";
import { CompanyLogo } from "@/components/CompanyLogo";
import { companiesFor, type Company } from "@/lib/companies";
import { daysUntil, placeName } from "@/lib/format";
import { upcomingEvents } from "@/lib/loughborough";
import { internshipRules } from "@/lib/roles";
import { publicClient } from "@/lib/supabase";

type Item = { id: number; title: string; employer: string; location: string | null; company_key: string | null; expires_at: string | null };
const COLS = "id,title,employer,location,company_key,expires_at";

async function fetchSide() {
  // Live data on every request (also lets us read the current time below).
  await connection();
  const db = publicClient();
  if (!db) return null;
  const today = new Date().toISOString().slice(0, 10);
  const twoWeeks = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const [internships, closing, partTime] = await Promise.all([
    internshipRules(db.from("roles").select(COLS).eq("is_open", true)).order("first_seen", { ascending: false }).limit(4),
    // Closing soon: main-list roles with the nearest deadlines.
    db.from("roles").select(COLS).eq("is_open", true).eq("kind", "job").eq("part_time", false)
      .in("start_status", ["confirmed", "likely"]).gte("expires_at", today).lte("expires_at", twoWeeks)
      .or(`tags->>deadline.is.null,tags->>deadline.gte.${today}`).order("expires_at", { ascending: true }).limit(5),
    db.from("roles").select("id", { count: "exact", head: true }).eq("is_open", true).eq("part_time", true).neq("start_status", "before"),
  ]);
  const all = [...(internships.data ?? []), ...(closing.data ?? [])] as Item[];
  const companies = await companiesFor(all.map((r) => r.company_key));
  return { internships: (internships.data ?? []) as Item[], closing: (closing.data ?? []) as Item[], partTime: partTime.count ?? 0, companies, events: upcomingEvents().slice(0, 3) };
}

function Block({ title, icon, href, children }: { title: string; icon: string; href: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={icon} />
            </svg>
          </span>
          {title}
        </h2>
        <Link href={href} className="text-xs font-semibold text-accent hover:underline">
          See all
        </Link>
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function RoleItems({ items, companies, empty, countdown = false }: { items: Item[]; companies: Map<string, Company>; empty: string; countdown?: boolean }) {
  if (items.length === 0) return <p className="py-2 text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((r) => {
        const c = r.company_key ? companies.get(r.company_key) : undefined;
        return (
          <li key={r.id}>
            <Link href={`/roles/${r.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
              <CompanyLogo name={r.employer} logoUrl={c?.logo_url} domain={c?.domain} size={34} />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 text-sm font-medium leading-snug">{r.title}</span>
                <span className="block truncate text-xs text-muted">
                  {r.employer}
                  {r.location ? ` · ${placeName(r.location)}` : ""}
                </span>
              </span>
              {countdown && r.expires_at && <DaysLeft iso={r.expires_at} />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function DaysLeft({ iso }: { iso: string }) {
  const d = daysUntil(iso);
  const tone = d <= 3 ? "bg-rose-soft text-rose" : d <= 7 ? "bg-amber-soft text-amber" : "bg-chip text-foreground/80";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${tone}`}>{d === 0 ? "Today" : `${d}d`}</span>;
}

// Right-hand column on All roles (and the Careers tab on phones): closing soon, internships,
// opening soon, events and part-time roles, each linking to its own page.
export async function SidePanel() {
  const side = await fetchSide();
  if (!side) return null;
  return (
    <div className="space-y-4 lg:sticky lg:top-20">
      <Block title="Closing soon" href="/?closing=1&sort=closing" icon="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z">
        <RoleItems items={side.closing} companies={side.companies} empty="Nothing closes in the next two weeks." countdown />
      </Block>
      <Block title="Internships and work experience" href="/internships" icon="M4 8h16v11H4zM9 8V5h6v3">
        <RoleItems items={side.internships} companies={side.companies} empty="None nearby right now. Remote and events internships show here too." />
      </Block>
      <Block title="Opening soon" href="/opening-soon" icon="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z">
        <p className="py-2 text-sm text-muted">Big graduate schemes that haven&apos;t opened yet, with register-interest links. Being set up.</p>
      </Block>
      <Block title="Career events" href="/events" icon="M5 5h14v15H5zM5 10h14M9 3v4M15 3v4">
        {side.events.length === 0 ? (
          <p className="py-2 text-sm text-muted">No events listed right now.</p>
        ) : (
          <ul className="divide-y divide-border">
            {side.events.map((e) => {
              const d = new Date(e.start);
              return (
                <li key={e.url}>
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 py-2.5 hover:opacity-80">
                    <span className="flex h-[34px] w-[34px] shrink-0 flex-col items-center justify-center rounded-lg bg-[#f1ebf6] leading-none text-[#5b2c83] dark:bg-[#2c2235] dark:text-[#d6c2e6]">
                      <span className="text-[9px] font-semibold uppercase">{d.toLocaleDateString("en-GB", { month: "short" })}</span>
                      <span className="text-sm font-bold">{d.getDate()}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="line-clamp-1 text-sm font-medium leading-snug">{e.title}</span>
                      <span className="block truncate text-xs text-muted">Loughborough · {e.where}</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </Block>
      <Link href="/part-time" className="card-lift flex items-center justify-between rounded-2xl border border-border bg-surface p-4 text-sm">
        <span>
          <span className="font-semibold">Part-time roles</span>
          <span className="block text-xs text-muted">Kept out of the main list</span>
        </span>
        <span className="rounded-full bg-chip px-2.5 py-1 text-xs font-semibold">{side.partTime}</span>
      </Link>
    </div>
  );
}

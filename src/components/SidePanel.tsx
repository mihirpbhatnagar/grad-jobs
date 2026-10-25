import Link from "next/link";
import { connection } from "next/server";
import { publicClient } from "@/lib/supabase";

type Item = { id: number; title: string; employer: string; location: string | null };

async function fetchSide() {
  // Live data on every request (also lets us read the current time below).
  await connection();
  const db = publicClient();
  if (!db) return null;
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [internships, newSchemes] = await Promise.all([
    db.from("roles").select("id,title,employer,location").eq("is_open", true).eq("kind", "internship").order("posted_at", { ascending: false, nullsFirst: false }).limit(5),
    db.from("roles").select("id,title,employer,location").eq("is_open", true).eq("kind", "job").eq("part_time", false)
      .in("start_status", ["confirmed", "likely"]).gte("first_seen", weekAgo).order("first_seen", { ascending: false }).limit(5),
  ]);
  return { internships: (internships.data ?? []) as Item[], newSchemes: (newSchemes.data ?? []) as Item[] };
}

function Block({ title, items, empty }: { title: string; items: Item[]; empty: string }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {items.map((r) => (
            <li key={r.id}>
              <Link href={`/roles/${r.id}`} className="block py-2.5 hover:opacity-80">
                <span className="line-clamp-2 text-sm font-medium leading-snug">{r.title}</span>
                <span className="mt-0.5 block truncate text-xs text-muted">
                  {r.employer}
                  {r.location ? ` · ${r.location}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Right-hand column on All roles: internships, newly found 2027 roles, and career events.
export async function SidePanel() {
  const side = await fetchSide();
  if (!side) return null;
  return (
    <div className="sticky top-20 space-y-4">
      <Block title="New this week" items={side.newSchemes} empty="New 2027 roles will appear here." />
      <Block title="Internships and placements" items={side.internships} empty="No open internships right now." />
      <section className="rounded-2xl border border-dashed border-border p-4">
        <h2 className="text-sm font-semibold tracking-tight">Career and networking events</h2>
        <p className="mt-2 text-sm text-muted">Coming soon: employer events and insight days.</p>
      </section>
    </div>
  );
}

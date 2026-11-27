import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ComingCard, PageBand } from "@/components/SectionIntro";
import { FAIRS, upcomingEvents } from "@/lib/loughborough";

async function Events() {
  await connection();
  const events = upcomingEvents();
  if (events.length === 0) return <p className="text-sm text-muted">No events listed right now.</p>;
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
      {events.map((e) => {
        const d = new Date(e.start);
        return (
          <li key={e.url} className="flex items-center gap-4 p-4">
            <div className="w-14 shrink-0 rounded-lg bg-[#f1ebf6] py-2 text-center text-[#5b2c83] dark:bg-[#2c2235] dark:text-[#d6c2e6]">
              <div className="text-[11px] font-semibold uppercase">{d.toLocaleDateString("en-GB", { month: "short" })}</div>
              <div className="text-lg font-bold leading-none">{d.getDate()}</div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-snug">{e.title}</p>
              <p className="mt-0.5 text-sm text-muted">
                {d.toLocaleDateString("en-GB", { weekday: "short" })} {d.toTimeString().slice(0, 5)}–{e.end} · {e.where} · Loughborough
              </p>
            </div>
            <a href={e.url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90">
              Book ↗
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export default function EventsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 pb-24 pt-6 sm:px-6">
      <PageBand title="Career events" lead="Workshops, careers fairs, employer presentations and networking events." />
      <section>
        <h2 className="text-lg font-semibold tracking-tight">Loughborough workshops</h2>
        <div className="mt-3">
          <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-chip" />}>
            <Events />
          </Suspense>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-semibold tracking-tight">Fairs and employer events</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {FAIRS.map((f) => (
            <a key={f.title} href={f.url} target="_blank" rel="noopener noreferrer" className="card-lift rounded-xl border border-border bg-surface p-5">
              <h3 className="font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.detail}</p>
            </a>
          ))}
        </div>
      </section>
      <ComingCard
        items={[
          "Employer insight evenings and virtual open days, pulled from the employers you follow.",
          "Networking events in London, Manchester and Birmingham.",
        ]}
      />
      <p className="text-sm text-muted">
        More Loughborough support on the <Link href="/loughborough" className="font-medium text-accent hover:underline">Loughborough page</Link>.
      </p>
    </main>
  );
}

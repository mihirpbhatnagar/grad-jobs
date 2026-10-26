import { connection } from "next/server";
import { Suspense } from "react";
import { FAIRS, LBORO_CHECKED, SUPPORT, TOOLS, upcomingEvents } from "@/lib/loughborough";

function External({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

function Card({ title, detail, url, cta = "Open" }: { title: string; detail: string; url: string; cta?: string }) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface p-5">
      <h3 className="font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">{detail}</p>
      <External href={url} className="mt-4 self-start rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:border-foreground/30">
        {cta} ↗
      </External>
    </div>
  );
}

async function UpcomingEvents() {
  await connection();
  const upcoming = upcomingEvents();
  if (upcoming.length === 0) {
    return <p className="text-sm text-muted">No workshops listed right now. New ones are advertised on Target Connect.</p>;
  }
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
      {upcoming.map((e) => {
        const d = new Date(e.start);
        return (
          <li key={e.url} className="flex items-center gap-4 p-4">
            <div className="w-14 shrink-0 rounded-xl bg-[#f1ebf6] py-2 text-center text-[#5b2c83] dark:bg-[#2c2235] dark:text-[#d6c2e6]">
              <div className="text-[11px] font-medium uppercase">{d.toLocaleDateString("en-GB", { month: "short" })}</div>
              <div className="text-lg font-semibold leading-none">{d.getDate()}</div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-snug">{e.title}</p>
              <p className="mt-0.5 text-sm text-muted">
                {d.toLocaleDateString("en-GB", { weekday: "short" })} {d.toTimeString().slice(0, 5)}–{e.end} · {e.where} · {e.series}
              </p>
            </div>
            <External href={e.url} className="shrink-0 rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90">
              Book ↗
            </External>
          </li>
        );
      })}
    </ul>
  );
}

export default function LoughboroughPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-8 sm:px-6">
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#5b2c83] text-sm font-bold tracking-tight text-white">LU</span>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Loughborough</h1>
          <p className="text-muted">Careers Network support for final-year students.</p>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-8">
          <section>
            <h2 className="text-lg font-semibold tracking-tight">Upcoming workshops</h2>
            <div className="mt-3">
              <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-chip" />}>
                <UpcomingEvents />
              </Suspense>
            </div>
          </section>
          <section>
            <h2 className="text-lg font-semibold tracking-tight">Get help with applications</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {SUPPORT.map((s) => <Card key={s.title} {...s} />)}
            </div>
          </section>
        </div>

        <aside className="space-y-8">
          <section>
            <h2 className="text-lg font-semibold tracking-tight">Fairs and employer events</h2>
            <div className="mt-3 space-y-3">
              {FAIRS.map((f) => <Card key={f.title} {...f} cta="Details" />)}
            </div>
          </section>
          <section>
            <h2 className="text-lg font-semibold tracking-tight">Useful links</h2>
            <div className="mt-3 space-y-3">
              {TOOLS.map((t) => <Card key={t.title} {...t} />)}
            </div>
          </section>
        </aside>
      </div>

      <p className="mt-10 text-xs text-muted">
        From Loughborough University&apos;s public careers pages, checked {LBORO_CHECKED}. Bookings open on the university&apos;s own site.
      </p>
    </main>
  );
}

// Brand header for a section, plus an optional "being set up" card listing what's coming.
export function PageBand({ title, lead, children }: { title: string; lead: string; children?: React.ReactNode }) {
  return (
    <section className="brand-band overflow-hidden rounded-3xl px-5 py-7 text-white shadow-xl shadow-indigo-950/20 sm:px-8 sm:py-9">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-white/80">{lead}</p>
      {children}
    </section>
  );
}

export function ComingCard({ title = "Being set up", items }: { title?: string; items: string[] }) {
  return (
    <section className="rounded-2xl border border-dashed border-accent/40 bg-accent-soft/40 p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-accent">
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
        {title}
      </h2>
      <ul className="mt-3 space-y-2 text-sm text-foreground/85">
        {items.map((c) => (
          <li key={c} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            {c}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SectionIntro({ title, lead, coming }: { title: string; lead: string; coming: string[] }) {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 pb-24 pt-6 sm:px-6">
      <PageBand title={title} lead={lead} />
      <ComingCard items={coming} />
    </main>
  );
}

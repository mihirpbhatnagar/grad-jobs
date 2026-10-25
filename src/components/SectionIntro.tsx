// Header plus a "what's coming here" card for sections still being built.
export function SectionIntro({ title, lead, coming }: { title: string; lead: string; coming: string[] }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted">{lead}</p>
      <section className="mt-8 rounded-2xl border border-dashed border-border p-6">
        <h2 className="text-sm font-semibold tracking-tight">Coming next</h2>
        <ul className="mt-3 space-y-2 text-sm text-foreground/85">
          {coming.map((c) => (
            <li key={c} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              {c}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

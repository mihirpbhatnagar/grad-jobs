export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-lg font-semibold text-accent">
            G
          </span>
          <span className="text-lg font-semibold tracking-tight">Grad Jobs</span>
        </div>
        <h1 className="mt-8 text-2xl font-semibold leading-snug tracking-tight">
          UK graduate roles starting in 2027, all in one place.
        </h1>
        <p className="mt-3 leading-relaxed text-muted">
          We&apos;re setting things up. The daily role feed is on its way.
        </p>
        <div className="mt-8 flex items-center gap-2 text-sm text-muted">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          Building
        </div>
      </div>
    </main>
  );
}

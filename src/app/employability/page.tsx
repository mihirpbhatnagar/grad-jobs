import Link from "next/link";
import { Suspense } from "react";
import { PageBand } from "@/components/SectionIntro";
import { SidePanel } from "@/components/SidePanel";

const LINKS = [
  { href: "/internships", title: "Internships", body: "Work experience nearby, remote or events" },
  { href: "/opening-soon", title: "Opening soon", body: "Schemes about to open" },
  { href: "/events", title: "Events", body: "Workshops, fairs, networking" },
  { href: "/part-time", title: "Part-time", body: "Kept out of the main list" },
];

// Phone "Careers" tab: everything beyond the main list in one place.
export default function EmployabilityPage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-24 pt-6 sm:px-6">
      <PageBand title="Careers" lead="Internships, schemes opening soon, events and part-time roles." />
      <div className="grid grid-cols-2 gap-3">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="card-lift rounded-xl border border-border bg-surface p-4">
            <span className="font-semibold tracking-tight">{l.title}</span>
            <span className="mt-0.5 block text-xs text-muted">{l.body}</span>
          </Link>
        ))}
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-chip" />}>
        <SidePanel />
      </Suspense>
    </main>
  );
}

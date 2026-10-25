import { Suspense } from "react";
import { SidePanel } from "@/components/SidePanel";

export default function EmployabilityPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Careers</h1>
      <p className="mt-2 text-muted">Internships, new roles this week and career events.</p>
      <div className="mt-8">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-chip" />}>
          <SidePanel />
        </Suspense>
      </div>
    </main>
  );
}

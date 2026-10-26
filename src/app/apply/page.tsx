import { Suspense } from "react";
import { Tracker } from "@/components/Tracker";

// Phone tab: saved roles plus the application tracker and dashboard.
export default function ApplyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Apply</h1>
      <p className="mt-2 text-muted">Your saved roles and every application, in one place.</p>
      <div className="mt-6">
        <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-chip" />}>
          <Tracker />
        </Suspense>
      </div>
    </main>
  );
}

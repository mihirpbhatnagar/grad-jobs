import { Suspense } from "react";
import { ForYou } from "@/components/ForYou";
import { StoryBankSection } from "@/components/StoryBankSection";
import { Tracker } from "@/components/Tracker";

// Desktop and iPad: For you alongside the application tracker. On phones the tracker
// lives in the Apply tab instead, so this page shows For you only.
export default function MyJobsPage() {
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-24 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight">For you</h1>
        <div className="mt-6">
          <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-chip" />}>
            <ForYou />
          </Suspense>
        </div>
      </div>
      <aside className="hidden md:block lg:pt-[60px]">
        <div className="lg:sticky lg:top-20">
          <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-chip" />}>
            <div className="space-y-4">
              <Tracker />
              <StoryBankSection />
            </div>
          </Suspense>
        </div>
      </aside>
    </main>
  );
}

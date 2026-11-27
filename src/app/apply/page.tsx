import { connection } from "next/server";
import { Suspense } from "react";
import { GmailQuestion } from "@/components/GmailLink";
import { ApplicationsBoard, loadMyJobs, SavedBoard } from "@/components/MyJobsBoards";
import { StoryBankSection } from "@/components/StoryBankSection";

// Phone tab: saved roles (soonest deadline first), then applications, then the story bank.
async function Boards() {
  await connection();
  const jobs = await loadMyJobs();
  return (
    <div className="space-y-8">
      <GmailQuestion />
      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Saved</h2>
        <SavedBoard jobs={jobs} />
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Applications</h2>
        <ApplicationsBoard jobs={jobs} />
      </section>
      <StoryBankSection />
    </div>
  );
}

export default function ApplyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Apply</h1>
      <p className="mt-2 text-muted">Your saved roles and every application, in one place.</p>
      <div className="mt-6">
        <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-chip" />}>
          <Boards />
        </Suspense>
      </div>
    </main>
  );
}

import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ForYou } from "@/components/ForYou";
import { GmailQuestion } from "@/components/GmailLink";
import { ApplicationsBoard, closingSoon, ClosingSoonCard, isToApply, loadMyJobs, SavedBoard } from "@/components/MyJobsBoards";

// My jobs: three tabs across the full width. For you (matches, with what's closing soon
// alongside), Saved (everything still to apply for, soonest deadline first) and Applications
// (everything applied for, by stage).
type Tab = "for-you" | "saved" | "applications";

function TabLink({ href, label, count, active }: { href: string; label: string; count?: number; active: boolean }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 font-medium transition-colors sm:px-4 ${active ? "bg-surface text-foreground shadow-sm ring-1 ring-border" : "text-muted hover:text-foreground"}`}
    >
      {label}
      {count !== undefined && <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-accent-soft text-accent" : "bg-surface text-muted"}`}>{count}</span>}
    </Link>
  );
}

async function MyJobs({ searchParams }: { searchParams: PageProps<"/my-jobs">["searchParams"] }) {
  await connection();
  const { tab: raw } = await searchParams;
  const tab: Tab = raw === "saved" ? "saved" : raw === "applications" ? "applications" : "for-you";
  const jobs = await loadMyJobs();
  const toApply = jobs.rows.filter(isToApply).length;
  return (
    <>
      <nav aria-label="My jobs" className="mt-5 inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-chip p-1 text-sm">
        <TabLink href="/my-jobs" label="For you" active={tab === "for-you"} />
        <TabLink href="/my-jobs?tab=saved" label="Saved" count={jobs.signedIn ? toApply : undefined} active={tab === "saved"} />
        <TabLink href="/my-jobs?tab=applications" label="Applications" count={jobs.signedIn ? jobs.rows.length - toApply : undefined} active={tab === "applications"} />
      </nav>
      <div className="mt-6">
        {tab === "saved" ? (
          <SavedBoard jobs={jobs} />
        ) : tab === "applications" ? (
          <ApplicationsBoard jobs={jobs} />
        ) : (
          <div className={closingSoon(jobs.rows).length ? "grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]" : "mx-auto max-w-4xl"}>
            <div className="min-w-0 space-y-6">
              <div className="empty:hidden">
                <GmailQuestion />
              </div>
              <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-chip" />}>
                <ForYou />
              </Suspense>
            </div>
            <aside className="hidden space-y-4 empty:hidden md:block">
              <ClosingSoonCard jobs={jobs} />
            </aside>
          </div>
        )}
      </div>
    </>
  );
}

export default function MyJobsPage(props: PageProps<"/my-jobs">) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">My jobs</h1>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-xl bg-chip" />}>
        <MyJobs searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

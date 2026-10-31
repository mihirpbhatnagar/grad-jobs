import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { APPLICATION_COLUMNS, ApplicationPanel, type Application } from "@/components/ApplicationPanel";
import { CompanyLogo } from "@/components/CompanyLogo";
import { requireUser } from "@/lib/auth";

// An application added by hand (the role isn't in the app). Saved roles open their role page instead.
async function Detail({ params }: { params: PageProps<"/applications/[id]">["params"] }) {
  const { id } = await params;
  const { db, user } = await requireUser(`/applications/${id}`);
  if (!/^\d+$/.test(id)) notFound();
  const { data } = await db.from("saved_roles").select(`${APPLICATION_COLUMNS},company,title,url`).eq("id", Number(id)).maybeSingle();
  if (!data) notFound();
  const app = data as Application & { company: string; title: string; url: string | null };
  if (app.role_id) redirect(`/roles/${app.role_id}`);
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center gap-4">
          <CompanyLogo name={app.company} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold leading-tight tracking-tight">{app.title}</h1>
            <p className="mt-1 text-muted">{app.company} · added by you</p>
          </div>
        </div>
        {app.url && (
          <a href={app.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
            Open the listing ↗
          </a>
        )}
      </section>
      <ApplicationPanel app={app} userId={user.id} removeRedirect="/my-jobs" />
    </div>
  );
}

export default function ApplicationPage(props: PageProps<"/applications/[id]">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <Link href="/my-jobs" className="text-sm font-medium text-muted hover:text-foreground">
        ← My jobs
      </Link>
      <div className="mt-4">
        <Suspense fallback={<div className="h-[60vh] animate-pulse rounded-3xl bg-chip" />}>
          <Detail params={props.params} />
        </Suspense>
      </div>
    </main>
  );
}

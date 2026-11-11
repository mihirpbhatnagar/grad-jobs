import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { APPLICATION_COLUMNS, ApplicationPanel, type Application } from "@/components/ApplicationPanel";
import { ApplyTools, type Saved } from "@/components/ApplyTools";
import { CompanyLogo } from "@/components/CompanyLogo";
import { FreeTools } from "@/components/FreeTools";
import { RoleContacts } from "@/components/Networking";
import { Chip } from "@/components/RoleCard";
import { aiAvailable } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { companyFor, sizeLabel } from "@/lib/companies";
import { dateLong, daysUntil, decodeEntities, distinctPlaces, employerLabel, isBoardName, salaryShort, startLabel } from "@/lib/format";
import type { Role } from "@/lib/roles";
import { runsPastVisa, visaEndsLabel, visaSettings } from "@/lib/visa";

// The application workspace for one saved role (or one added by hand): everything needed to
// apply, in the order it's done. Know the company, tailor the CV, plan the cover letter, answer
// the questions, find people to ask, then record what was sent.

type WorkRole = Pick<Role, "id" | "title" | "employer" | "company_key" | "location" | "locations" | "expires_at" | "apply_url" | "salary_min" | "salary_max" | "tags" | "start_status"> & {
  description: string | null;
  is_open: boolean;
};

const STEPS = [
  { id: "company", label: "Company" },
  { id: "cv", label: "Your CV" },
  { id: "cover", label: "Cover letter" },
  { id: "questions", label: "Questions" },
  { id: "people", label: "People" },
];

function Step({ n, id, title, lead, children }: { n: number; id: string; title: string; lead: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">{n}</span>
        <div>
          <h2 className="text-lg font-semibold leading-7 tracking-tight">{title}</h2>
          <p className="text-sm text-muted">{lead}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

async function Workspace({ params }: { params: PageProps<"/applications/[id]">["params"] }) {
  const { id } = await params;
  const { db, user } = await requireUser(`/applications/${id}`);
  if (!/^\d+$/.test(id)) notFound();
  const { data } = await db.from("saved_roles").select(`${APPLICATION_COLUMNS},company,title,url`).eq("id", Number(id)).maybeSingle();
  if (!data) notFound();
  const app = data as Application & { company: string | null; title: string | null; url: string | null };

  const [{ data: roleRow }, { data: profile }, { data: aiRows }, aiOn, visa] = await Promise.all([
    app.role_id
      ? db.from("roles").select("id,title,employer,company_key,location,locations,expires_at,is_open,apply_url,salary_min,salary_max,tags,start_status,description").eq("id", app.role_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("profiles").select("cv_text,story_bank").maybeSingle(),
    app.role_id
      ? db.from("ai_outputs").select("kind,content,created_at").eq("role_id", app.role_id).in("kind", ["brief", "cv", "rewrite", "cover"]).order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [] }),
    aiAvailable(),
    visaSettings(),
  ]);
  const role = roleRow as WorkRole | null;
  const company = role && !isBoardName(role.employer) ? await companyFor(role.company_key) : null;
  const aiSaved = [...new Map(((aiRows ?? []) as Saved[]).map((x) => [x.kind, x])).values()];

  const title = role?.title ?? app.title ?? "Application";
  const employer = role ? (company?.name ?? employerLabel(role.employer)) : (app.company ?? "");
  const places = role ? distinctPlaces(role.location, role.locations) : [];
  const closes = role ? (role.tags.deadline ?? role.expires_at) : app.closes_on;
  const days = closes ? daysUntil(closes) : null;
  const closed = (!!role && !role.is_open) || (days !== null && days < 0);
  const applyUrl = role?.apply_url ?? app.url;
  const job = role?.description ? decodeEntities(role.description) : "";
  const cvText = profile?.cv_text ?? "";
  const storyBank = profile?.story_bank ?? "";
  const pay = role ? salaryShort(role.salary_min, role.salary_max) : null;
  const facts = [company?.industry, company?.hq && `HQ ${company.hq}`, company?.founded && `Founded ${company.founded}`, sizeLabel(company?.employees ?? null)].filter(Boolean) as string[];
  const tools = { job, company: employer, title, cvText, storyBank };

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start gap-4">
          <CompanyLogo name={role?.employer ?? app.company ?? "?"} logoUrl={company?.logo_url} domain={company?.domain} size={60} />
          <div className="min-w-0 flex-1 basis-64">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">Application workspace</p>
            <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-tight">{title}</h1>
            <p className="mt-1 text-muted">
              <span className="font-medium text-foreground">{employer}</span>
              {places.length > 0 && ` · ${places[0]}${places.length > 1 ? ` +${places.length - 1}` : ""}`}
              {!role && " · added by you"}
            </p>
            {role && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Chip tone="accent">{startLabel(role)}</Chip>
                {role.tags.lengthMonths && <Chip>{role.tags.lengthMonths} months</Chip>}
                {pay && <Chip>{pay}</Chip>}
                {role.tags.degree && <Chip>{role.tags.degree}+</Chip>}
                {runsPastVisa(role, visa) && (
                  <Chip tone="amber" title={`This role would still be running when your Graduate visa ends (${visaEndsLabel(visa)}). Ask about sponsorship early.`}>
                    Runs past your visa
                  </Chip>
                )}
                {role.tags.sponsorship === "not_offered" && <Chip tone="rose">Says no sponsorship</Chip>}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
            <div className="sm:text-right">
              {closed ? (
                <div className="text-sm font-semibold text-rose">May have closed: check the employer&apos;s site</div>
              ) : days !== null ? (
                <>
                  <div className={`text-xl font-semibold tabular-nums ${days <= 7 ? "text-rose" : days <= 21 ? "text-amber" : "text-foreground"}`}>
                    {days === 0 ? "Closes today" : days === 1 ? "Closes tomorrow" : `${days} days left`}
                  </div>
                  <div className="text-xs text-muted">Closes {dateLong(closes!)}</div>
                </>
              ) : (
                <>
                  <div className="text-sm font-semibold">No closing date</div>
                  <div className="text-xs text-muted">May close when filled: apply early</div>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {role && (
                <Link href={`/roles/${role.id}`} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:border-foreground/30">
                  Full listing
                </Link>
              )}
              {applyUrl && (
                <a href={applyUrl} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">
                  Apply on their site ↗
                </a>
              )}
            </div>
          </div>
        </div>
        <nav aria-label="Steps" className="mt-5 flex flex-wrap gap-1.5 border-t border-border pt-4 text-sm">
          {STEPS.map((s, i) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-lg bg-chip px-3 py-1.5 font-medium text-muted hover:text-foreground">
              {i + 1}. {s.label}
            </a>
          ))}
          <a href="#sent" className="rounded-lg bg-chip px-3 py-1.5 font-medium text-muted hover:text-foreground">
            6. Send and track
          </a>
        </nav>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Step n={1} id="company" title="Know the company" lead="What they do and what they look for, so your application sounds like you chose them.">
            {company?.summary || company?.description ? (
              <p className="text-sm leading-6 text-foreground/85">{company.summary ?? company.description}</p>
            ) : (
              <p className="text-sm text-muted">No company profile is held for {employer || "this employer"} yet.</p>
            )}
            {facts.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {facts.map((f) => (
                  <Chip key={f}>{f}</Chip>
                ))}
              </div>
            )}
            {role && (
              <div className="mt-4">
                <ApplyTools roleId={role.id} initial={aiSaved} enabled={aiOn} signedIn kinds={["brief"]} />
              </div>
            )}
          </Step>

          <Step n={2} id="cv" title="Tailor your CV" lead="See which of the listing's skills your CV already shows, and which of your real experiences to lead with.">
            {!cvText && (
              <p className="mb-3 rounded-xl bg-amber-soft px-3 py-2 text-sm text-amber">
                No CV uploaded yet.{" "}
                <Link href="/profile" className="font-semibold underline underline-offset-2">
                  Add it on your profile
                </Link>{" "}
                and this step fills in.
              </p>
            )}
            <FreeTools {...tools} tabs={["keywords", "stories", "bullets"]} />
            {role && (
              <div className="mt-5 border-t border-border pt-4">
                <ApplyTools roleId={role.id} initial={aiSaved} enabled={aiOn} signedIn kinds={["cv", "rewrite"]} />
              </div>
            )}
          </Step>

          <Step n={3} id="cover" title="Plan your cover letter" lead="A structure and the points to make. You write the letter; the check below tells you if a draft sounds like AI.">
            <FreeTools {...tools} tabs={["cover", "ai"]} />
            {role && (
              <div className="mt-5 border-t border-border pt-4">
                <ApplyTools roleId={role.id} initial={aiSaved} enabled={aiOn} signedIn kinds={["cover"]} />
              </div>
            )}
          </Step>

          <Step n={4} id="questions" title="Application questions" lead="Paste a question from the form for a structure and the stories of yours that answer it best.">
            <FreeTools {...tools} tabs={["question"]} />
          </Step>

          <Step n={5} id="people" title="People to reach out to" lead="A short message to someone already there often gets you further than the form alone.">
            {role || app.company ? (
              <RoleContacts employer={role ? (company?.name ?? role.employer) : app.company!} description={role?.description ?? null} />
            ) : (
              <p className="text-sm text-muted">Add the company name to find people there.</p>
            )}
          </Step>
        </div>

        <aside id="sent" className="scroll-mt-20 space-y-4">
          <ApplicationPanel app={app} userId={user.id} roleCloses={role ? closes : undefined} removeRedirect="/my-jobs?tab=saved" />
        </aside>
      </div>
    </div>
  );
}

export default function ApplicationPage(props: PageProps<"/applications/[id]">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6">
      <Link href="/my-jobs?tab=saved" className="text-sm font-medium text-muted hover:text-foreground">
        ← Saved roles
      </Link>
      <div className="mt-4">
        <Suspense fallback={<div className="h-[60vh] animate-pulse rounded-3xl bg-chip" />}>
          <Workspace params={props.params} />
        </Suspense>
      </div>
    </main>
  );
}

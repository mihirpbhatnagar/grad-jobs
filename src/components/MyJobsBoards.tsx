import Link from "next/link";
import { CompanyLogo } from "@/components/CompanyLogo";
import { Chip } from "@/components/RoleCard";
import { SaveButton } from "@/components/SaveButton";
import { StageSelect } from "@/components/StageControls";
import { currentUser } from "@/lib/auth";
import { companiesFor, type Company } from "@/lib/companies";
import { networkingLinks } from "@/lib/contacts";
import { dateShort, daysUntil, distinctPlaces, employerLabel, isBoardName, salaryShort, startLabel } from "@/lib/format";
import { RESPONDED, STAGES, type Stage } from "@/lib/pipeline";
import type { Role } from "@/lib/roles";
import { runsPastVisa, visaEndsLabel, visaSettings, type VisaSettings } from "@/lib/visa";

// Everything the My jobs tabs show: the signed-in user's saved roles and applications.

type SavedRole = Pick<Role, "id" | "title" | "employer" | "company_key" | "location" | "locations" | "expires_at" | "apply_url" | "salary_min" | "salary_max" | "tags" | "start_status"> & { is_open: boolean };
export type JobRow = {
  id: number;
  stage: Stage;
  company: string | null;
  title: string | null;
  url: string | null;
  closes_on: string | null;
  applied_at: string | null;
  saved_at: string;
  updated_at: string;
  role: SavedRole | null;
};
export type MyJobs = { signedIn: boolean; rows: JobRow[]; companies: Map<string, Company>; visa: VisaSettings; noReplyWeeks: number };

const TO_APPLY: Stage[] = ["saved", "applying"];
export const isToApply = (r: JobRow) => TO_APPLY.includes(r.stage);

export async function loadMyJobs(): Promise<MyJobs> {
  const { db, user } = await currentUser();
  const visa = await visaSettings();
  if (!user) return { signedIn: false, rows: [], companies: new Map(), visa, noReplyWeeks: 4 };
  const [{ data }, { data: setting }] = await Promise.all([
    db
      .from("saved_roles")
      .select("id,stage,company,title,url,closes_on,applied_at,saved_at,updated_at,role:roles(id,title,employer,company_key,location,locations,expires_at,is_open,apply_url,salary_min,salary_max,tags,start_status)")
      .order("saved_at", { ascending: false }),
    db.from("settings").select("value").eq("key", "inbox.no_reply_weeks").maybeSingle(),
  ]);
  const rows = ((data ?? []) as unknown as JobRow[]).filter((r) => r.role || r.title);
  const companies = await companiesFor(rows.map((r) => r.role?.company_key));
  return { signedIn: true, rows, companies, visa, noReplyWeeks: Number(setting?.value ?? 4) };
}

// The closing date we hold: the listing's own, or the one typed in for a role added by hand.
const closingDate = (row: JobRow): string | null => (row.role ? (row.role.tags.deadline ?? row.role.expires_at) : row.closes_on);
const mayHaveClosed = (row: JobRow) => (!!row.role && !row.role.is_open) || (closingDate(row) !== null && daysUntil(closingDate(row)!) < 0);
// A saved role's hub is its application workspace (the full listing is one click from there).
const hrefOf = (row: JobRow) => `/applications/${row.id}`;
const employerOf = (row: JobRow) => (row.role ? employerLabel(row.role.employer) : (row.company ?? ""));
const titleOf = (row: JobRow) => row.role?.title ?? row.title ?? "";
// People to reach out to live with the role: a search for Loughborough alumni at that employer
// (a LinkedIn link the user opens themselves).
function AlumniLink({ row }: { row: JobRow }) {
  const employer = row.role?.employer ?? row.company;
  if (!employer || isBoardName(employer)) return null;
  const [alumni] = networkingLinks(employer);
  return (
    <a href={alumni.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted hover:border-accent/40 hover:text-accent">
      Lboro alumni there ↗
    </a>
  );
}

const daysText = (days: number) => (days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days`);

export const CLOSING_WITHIN_DAYS = 21;
export function closingSoon(rows: JobRow[]) {
  return rows
    .filter((r) => isToApply(r) && !mayHaveClosed(r) && closingDate(r))
    .map((row) => ({ row, iso: closingDate(row)!, days: daysUntil(closingDate(row)!) }))
    .filter((c) => c.days <= CLOSING_WITHIN_DAYS)
    .sort((a, b) => a.days - b.days);
}

function SignIn({ what }: { what: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-8 text-center">
      <h2 className="text-lg font-semibold tracking-tight">Sign in to see {what}</h2>
      <Link href="/sign-in?next=/my-jobs" className="mt-4 inline-flex rounded-xl bg-foreground px-5 py-2.5 text-sm font-medium text-background">
        Sign in
      </Link>
    </div>
  );
}

function Tile({ value, label, tone = "plain" }: { value: string | number; label: string; tone?: "plain" | "rose" | "accent" | "success" }) {
  const tones = { plain: "text-foreground", rose: "text-rose", accent: "text-accent", success: "text-success" };
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <div className={`text-2xl font-semibold tabular-nums tracking-tight ${tones[tone]}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

// Small card for the For you tab: saved roles closing in the next three weeks.
export function ClosingSoonCard({ jobs }: { jobs: MyJobs }) {
  const closing = closingSoon(jobs.rows);
  if (!closing.length) return null;
  return (
    <section className="rounded-2xl border border-rose/30 bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold tracking-tight">Closing soon</h2>
        <Link href="/my-jobs?tab=saved" className="text-xs font-medium text-accent hover:underline">
          All saved →
        </Link>
      </div>
      <ul className="mt-2 space-y-1">
        {closing.map(({ row, iso, days }) => (
          <li key={row.id}>
            <Link href={hrefOf(row)} className="-mx-2 flex items-start justify-between gap-3 rounded-xl px-2 py-2 hover:bg-chip">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{employerOf(row)}</span>
                <span className="line-clamp-2 text-xs text-muted">{titleOf(row)}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className={`block text-sm font-semibold ${days <= 7 ? "text-rose" : "text-foreground"}`}>{daysText(days)}</span>
                <span className="block text-xs text-muted">{dateShort(iso)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// One saved role across the full width: what it is, when it closes, and the next action.
function SavedRow({ row, jobs }: { row: JobRow; jobs: MyJobs }) {
  const role = row.role;
  const company = role?.company_key && !isBoardName(role.employer) ? jobs.companies.get(role.company_key) : null;
  const iso = closingDate(row);
  const closed = mayHaveClosed(row);
  const days = iso ? daysUntil(iso) : null;
  const places = role ? distinctPlaces(role.location, role.locations) : [];
  const pay = role ? salaryShort(role.salary_min, role.salary_max) : null;
  const applyUrl = role?.apply_url ?? row.url;
  return (
    <article className="flex flex-wrap items-start gap-x-4 gap-y-3 rounded-2xl border border-border bg-surface p-4 sm:flex-nowrap sm:items-center">
      <CompanyLogo name={role?.employer ?? row.company ?? "?"} logoUrl={company?.logo_url} domain={company?.domain} size={44} />
      <div className="min-w-0 flex-1 basis-[60%] sm:basis-auto">
        <h3 className="font-semibold leading-snug tracking-tight">
          <Link href={hrefOf(row)} className="hover:underline">
            {titleOf(row)}
          </Link>
        </h3>
        <p className="mt-0.5 truncate text-sm text-muted">
          <span className="font-medium text-foreground/90">{employerOf(row)}</span>
          {places.length > 0 && ` · ${places[0]}${places.length > 1 ? ` +${places.length - 1}` : ""}`}
        </p>
        {role && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip tone="accent">{startLabel(role)}</Chip>
            {role.tags.lengthMonths && <Chip>{role.tags.lengthMonths} months</Chip>}
            {pay && <Chip>{pay}</Chip>}
            {runsPastVisa(role, jobs.visa) && (
              <Chip tone="amber" title={`This role would still be running when your Graduate visa ends (${visaEndsLabel(jobs.visa)}). Ask about sponsorship early.`}>
                Runs past your visa
              </Chip>
            )}
            {role.tags.sponsorship === "not_offered" && <Chip tone="rose">Says no sponsorship</Chip>}
            <AlumniLink row={row} />
          </div>
        )}
      </div>
      <div className="w-24 shrink-0 sm:text-right">
        {closed ? (
          <>
            <div className="text-sm font-semibold text-rose">May have closed</div>
            <div className="text-xs text-muted">{iso ? `Was ${dateShort(iso)}` : "Listing has gone"}</div>
          </>
        ) : days !== null ? (
          <>
            <div className={`text-lg font-semibold leading-tight tabular-nums ${days <= 7 ? "text-rose" : days <= CLOSING_WITHIN_DAYS ? "text-amber" : "text-foreground"}`}>{daysText(days)}</div>
            <div className="text-xs text-muted">Closes {dateShort(iso!)}</div>
          </>
        ) : (
          <>
            <div className="text-sm font-semibold">No closing date</div>
            <div className="text-xs text-muted">Apply early</div>
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="w-[7.25rem] [&_select]:w-full [&_select]:px-2">
          <StageSelect applicationId={row.id} stage={row.stage} />
        </div>
        <Link href={`/applications/${row.id}`} className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:opacity-90">
          Prepare
        </Link>
        {applyUrl && (
          <a href={applyUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:border-foreground/30">
            Apply ↗
          </a>
        )}
        {role && row.stage === "saved" && <SaveButton roleId={role.id} saved signedIn />}
      </div>
    </article>
  );
}

function Group({ title, note, rows, jobs }: { title: string; note?: string; rows: JobRow[]; jobs: MyJobs }) {
  if (!rows.length) return null;
  return (
    <section>
      <h2 className="flex items-baseline gap-2 text-sm font-semibold tracking-tight">
        {title}
        <span className="font-normal text-muted">
          {rows.length}
          {note ? ` · ${note}` : ""}
        </span>
      </h2>
      <div className="mt-2 space-y-2">
        {rows.map((row) => (
          <SavedRow key={row.id} row={row} jobs={jobs} />
        ))}
      </div>
    </section>
  );
}

// Saved tab: every role saved but not yet applied for, soonest closing date first.
export function SavedBoard({ jobs }: { jobs: MyJobs }) {
  if (!jobs.signedIn) return <SignIn what="your saved roles" />;
  const rows = jobs.rows.filter(isToApply);
  const soon = closingSoon(jobs.rows).map((c) => c.row);
  const soonIds = new Set(soon.map((r) => r.id));
  const closed = rows.filter(mayHaveClosed);
  const dated = rows.filter((r) => !soonIds.has(r.id) && !mayHaveClosed(r) && closingDate(r)).sort((a, b) => closingDate(a)!.localeCompare(closingDate(b)!));
  const undated = rows.filter((r) => !closingDate(r) && !mayHaveClosed(r));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile value={rows.length} label="Saved, still to apply" />
        <Tile value={soon.length} label="Closing within 3 weeks" tone={soon.length ? "rose" : "plain"} />
        <Tile value={undated.length} label="No closing date: apply early" />
        <Tile value={rows.filter((r) => r.stage === "applying").length} label="Application started" tone="accent" />
      </div>
      <div className="min-w-0 space-y-6">
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center text-muted">
              Nothing saved yet. Tap the bookmark on any role and it appears here with its closing date.
            </div>
          ) : (
            <>
              <Group title="Closing soon" note="within 3 weeks" rows={soon} jobs={jobs} />
              <Group title="Closing later" rows={dated} jobs={jobs} />
              <Group title="No closing date" note="may close when filled" rows={undated} jobs={jobs} />
              <Group title="May have closed" note="check the employer's site" rows={closed} jobs={jobs} />
            </>
          )}
          <p className="text-sm text-muted">
<span className="font-medium text-foreground">Prepare</span> opens the role&apos;s workspace: CV match, cover letter plan and what you sent. Set a role to{" "}
            <span className="font-medium text-foreground">Applied</span> and it moves to the Applications tab.{" "}
            <Link href="/applications/new" className="font-medium text-accent hover:underline">
              Add a role you found elsewhere
            </Link>
          </p>
      </div>
    </div>
  );
}

const PIPELINE: Stage[] = ["applied", "test", "interview", "assessment_centre", "offer", "rejected"];
const stageName = (id: Stage) => STAGES.find((s) => s.id === id)?.label ?? id;

// Applications tab: everything applied for, by stage, with the ones that need chasing marked.
export function ApplicationsBoard({ jobs }: { jobs: MyJobs }) {
  if (!jobs.signedIn) return <SignIn what="your applications" />;
  const rows = jobs.rows.filter((r) => !isToApply(r)).sort((a, b) => PIPELINE.indexOf(a.stage) - PIPELINE.indexOf(b.stage) || b.updated_at.localeCompare(a.updated_at));
  const replied = rows.filter((r) => RESPONDED.includes(r.stage)).length;
  const count = (s: Stage) => rows.filter((r) => r.stage === s).length;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
        {PIPELINE.map((s) => (
          <Tile key={s} value={count(s)} label={stageName(s)} tone={s === "offer" && count(s) ? "success" : s === "rejected" || !count(s) ? "plain" : "accent"} />
        ))}
        <Tile value={rows.length ? `${Math.round((replied / rows.length) * 100)}%` : "–"} label="Replied" />
      </div>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center text-muted">
          No applications yet. When you apply for a saved role, set its status to Applied and it shows here.{" "}
          <Link href="/applications/new" className="font-medium text-accent hover:underline">
            Add one you made elsewhere
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const company = row.role?.company_key && !isBoardName(row.role.employer) ? jobs.companies.get(row.role.company_key) : null;
            const weeks = Math.floor((Date.now() - new Date(row.updated_at).getTime()) / (7 * 86_400_000));
            const chase = row.stage === "applied" && weeks >= jobs.noReplyWeeks;
            return (
              <article key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-border bg-surface p-4 sm:flex-nowrap">
                <CompanyLogo name={row.role?.employer ?? row.company ?? "?"} logoUrl={company?.logo_url} domain={company?.domain} size={44} />
                <div className="min-w-0 flex-1 basis-[60%] sm:basis-auto">
                  <h3 className="font-semibold leading-snug tracking-tight">
                    <Link href={hrefOf(row)} className="hover:underline">
                      {titleOf(row)}
                    </Link>
                  </h3>
                  <p className="mt-0.5 truncate text-sm text-muted">
                    <span className="font-medium text-foreground/90">{employerOf(row)}</span>
                  </p>
                  <div className="mt-2">
                    <AlumniLink row={row} />
                  </div>
                </div>
                <div className="w-36 shrink-0 text-sm sm:text-right">
                  <div className="font-medium">{row.applied_at ? `Applied ${dateShort(row.applied_at)}` : "Applied date not set"}</div>
                  <div className={`text-xs ${chase ? "font-medium text-rose" : "text-muted"}`}>{chase ? `No reply for ${weeks} weeks` : `Updated ${dateShort(row.updated_at)}`}</div>
                </div>
                <StageSelect applicationId={row.id} stage={row.stage} />
                <Link href={`/applications/${row.id}`} className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:border-foreground/30">
                  Open
                </Link>
              </article>
            );
          })}
          <p className="pt-2 text-sm text-muted">
            <Link href="/applications/new" className="font-medium text-accent hover:underline">
              Add an application you made elsewhere
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}

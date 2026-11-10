import Link from "next/link";
import { CompanyLogo } from "@/components/CompanyLogo";
import { SaveButton } from "@/components/SaveButton";
import type { Company } from "@/lib/companies";
import type { Role } from "@/lib/roles";
import { runsPastVisa, visaEndsLabel, type VisaSettings } from "@/lib/visa";
import { dateShort, daysUntil, employerLabel, isBoardName, isCompetitive, placeName, postedAgo, salaryShort, startLabel } from "@/lib/format";

export function Chip({ children, tone = "plain", title }: { children: React.ReactNode; tone?: "plain" | "accent" | "success" | "amber" | "rose"; title?: string }) {
  const tones = {
    plain: "bg-chip text-foreground/75",
    accent: "bg-accent-soft text-accent",
    success: "bg-success-soft text-success",
    amber: "bg-amber-soft text-amber",
    rose: "bg-rose-soft text-rose",
  };
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function SponsorTick() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
      <path d="M8 1.5 9.6 3l2.2-.2.5 2.1 1.9 1.2-.8 2 .8 2-1.9 1.2-.5 2.1-2.2-.2L8 14.5 6.4 13l-2.2.2-.5-2.1L1.8 9.9l.8-2-.8-2 1.9-1.2.5-2.1L6.4 3zM7 10.6l4.2-4.2-1-1L7 8.6 5.6 7.2l-1 1z" />
    </svg>
  );
}

export function RoleCard({
  role,
  company: companyInfo,
  saved = false,
  signedIn = false,
  matchTags,
  visa,
}: {
  role: Role;
  company?: Company | null;
  saved?: boolean;
  signedIn?: boolean;
  matchTags?: string[];
  // The viewer's Graduate visa dates, for the "Runs past your visa" flag.
  visa?: VisaSettings | null;
}) {
  // A job board isn't the employer, so its company facts and logo aren't shown.
  const company = isBoardName(role.employer) ? null : companyInfo;
  const t = role.tags;
  const pay = salaryShort(role.salary_min, role.salary_max);
  const closes = t.deadline ?? role.expires_at;
  const days = closes ? daysUntil(closes) : null;
  // No source has confirmed the listing for over a week (for example, one found only by a
  // search that hasn't run since): it may have closed, so the card says so instead of "apply early".
  const unconfirmed = !!role.last_seen && daysUntil(role.last_seen) < -7;
  const extraLocations = role.locations.length - 1;
  const about = company?.description;

  return (
    <article className="card-lift relative rounded-2xl border border-border bg-surface p-5">
      {matchTags && matchTags.length > 0 && (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
          <span aria-hidden>✦</span>
          {matchTags.join(" · ")}
        </p>
      )}
      <div className="flex items-start gap-4">
        <CompanyLogo name={role.employer} logoUrl={company?.logo_url} domain={company?.domain} size={52} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold leading-snug tracking-tight">
            <Link href={`/roles/${role.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
              {role.title}
            </Link>
          </h2>
          <p className="mt-0.5 text-sm">
            <span className="font-medium text-foreground/90">{company?.name && company.name.length <= role.employer.length + 6 ? company.name : employerLabel(role.employer)}</span>
            {about && <span className="text-muted"> · {about[0].toUpperCase() + about.slice(1)}</span>}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {role.location && (
              <span className="inline-flex items-center gap-1">
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M10 18s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10z" />
                  <circle cx="10" cy="8" r="2" />
                </svg>
                {placeName(role.location)}
                {extraLocations > 0 && ` +${extraLocations}`}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <SaveButton roleId={role.id} saved={saved} signedIn={signedIn} />
          {pay ? (
            <span className="text-right">
              <span className="block text-lg font-bold leading-none tracking-tight text-foreground tabular-nums">{pay}</span>
              <span className="text-[11px] font-medium text-muted">a year</span>
            </span>
          ) : isCompetitive(role.salary_text, t) ? (
            <span className="text-right">
              <span className="block text-base font-bold leading-none tracking-tight text-foreground">Competitive</span>
              <span className="text-[11px] font-medium text-muted">salary</span>
            </span>
          ) : (
            <span className="text-right text-[11px] font-medium leading-tight text-muted">
              Salary
              <br />
              not stated
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5 sm:pl-[68px]">
        <Chip tone="accent">{startLabel(role)}</Chip>
        {t.abroad && (
          <Chip tone={t.sponsorship === "offered" ? "success" : t.sponsorship === "not_offered" ? "rose" : "amber"}>
            {t.abroad} · {t.sponsorship === "offered" ? "visa sponsorship offered" : t.sponsorship === "not_offered" ? "no visa sponsorship" : "sponsorship not stated"}
          </Chip>
        )}
        {role.sponsor_status === "likely" && (
          <Chip tone="success" title={role.sponsor_name ? `Register entry: ${role.sponsor_name}` : undefined}>
            <SponsorTick />
            Licensed sponsor
          </Chip>
        )}
        {(t.graduateScheme || t.programmeTitle) && <Chip>Graduate scheme</Chip>}
        {t.degree && <Chip>{t.degree}+</Chip>}
        {t.lengthMonths && <Chip>{t.lengthMonths} months</Chip>}
        {visa && runsPastVisa(role, visa) && (
          <Chip tone="amber" title={`This role would still be running when your Graduate visa ends (${visaEndsLabel(visa)}). Ask about sponsorship early.`}>
            Runs past your visa
          </Chip>
        )}
        {t.drivingLicence && <Chip>Driving licence</Chip>}
        {t.sponsorship === "not_offered" && <Chip tone="rose">Says no sponsorship</Chip>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3 text-sm font-semibold sm:ml-[68px]">
        <span className="inline-flex items-center gap-1.5 text-foreground">
          <svg viewBox="0 0 20 20" className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="10" cy="10" r="7" />
            <path d="M10 6v4l2.5 2" strokeLinecap="round" />
          </svg>
          {role.posted_at ? postedAgo(role.posted_at) : "Posting date not stated"}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 ${days === null ? (unconfirmed ? "text-amber" : "text-muted") : days < 0 ? "text-muted" : days <= 7 ? "text-rose" : days <= 14 ? "text-amber" : "text-foreground"}`}
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M4 5h12v12H4zM4 9h12M8 3v4M12 3v4" strokeLinejoin="round" />
          </svg>
          {days === null
            ? unconfirmed
              ? `Not re-checked since ${dateShort(role.last_seen!)}: may have closed`
              : "No closing date: apply early"
            : days < 0
              ? "May have closed"
              : `Closes ${dateShort(closes!)} · ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} left`}`}
        </span>
      </div>
    </article>
  );
}

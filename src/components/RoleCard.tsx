import Link from "next/link";
import { CompanyLogo } from "@/components/CompanyLogo";
import { SaveButton } from "@/components/SaveButton";
import type { Company } from "@/lib/companies";
import type { Role } from "@/lib/roles";
import { daysUntil, postedAgo, salaryShort, startLabel } from "@/lib/format";

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
  company,
  estimate,
  saved = false,
  signedIn = false,
  matchTags,
}: {
  role: Role;
  company?: Company | null;
  estimate?: number | null;
  saved?: boolean;
  signedIn?: boolean;
  matchTags?: string[];
}) {
  const t = role.tags;
  const pay = salaryShort(role.salary_min, role.salary_max);
  const closes = t.deadline ?? role.expires_at;
  const days = closes ? daysUntil(closes) : null;
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
            <span className="font-medium text-foreground/90">{company?.name && company.name.length <= role.employer.length + 6 ? company.name : role.employer}</span>
            {about && <span className="text-muted"> · {about[0].toUpperCase() + about.slice(1)}</span>}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {role.location && (
              <span className="inline-flex items-center gap-1">
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M10 18s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10z" />
                  <circle cx="10" cy="8" r="2" />
                </svg>
                {role.location}
                {extraLocations > 0 && ` +${extraLocations}`}
              </span>
            )}
            {pay ? (
              <span className="font-semibold text-foreground">{pay}</span>
            ) : estimate ? (
              <span title="Not stated in the listing. Estimate from similar roles in the app.">≈ {salaryShort(estimate, null)} <span className="text-xs">est.</span></span>
            ) : null}
          </p>
        </div>
        <SaveButton roleId={role.id} saved={saved} signedIn={signedIn} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5 sm:pl-[68px]">
        <Chip tone="accent">{startLabel(role)}</Chip>
        {role.sponsor_status === "likely" && (
          <Chip tone="success" title={role.sponsor_name ? `Register entry: ${role.sponsor_name}` : undefined}>
            <SponsorTick />
            Licensed sponsor
          </Chip>
        )}
        {(t.graduateScheme || t.programmeTitle) && <Chip>Graduate scheme</Chip>}
        {t.degree && <Chip>{t.degree}+</Chip>}
        {t.lengthMonths && <Chip>{t.lengthMonths} months</Chip>}
        {t.drivingLicence && <Chip>Driving licence</Chip>}
        {t.sponsorship === "not_offered" && <Chip tone="rose">Says no sponsorship</Chip>}
        <span className="ml-auto flex items-center gap-3 text-xs text-muted">
          {days !== null && days >= 0 && (
            <span className={days <= 7 ? "font-semibold text-rose" : days <= 14 ? "font-semibold text-amber" : ""}>
              {days === 0 ? "Closes today" : `Closes in ${days} day${days === 1 ? "" : "s"}`}
            </span>
          )}
          {role.posted_at && <span>{postedAgo(role.posted_at)}</span>}
        </span>
      </div>
    </article>
  );
}

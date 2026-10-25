import Link from "next/link";
import type { Role } from "@/lib/roles";

const SPONSOR_BADGE = {
  likely: { label: "Licensed sponsor", className: "bg-accent-soft text-accent" },
  unclear: { label: "Sponsor unclear", className: "bg-amber-soft text-amber" },
  not_listed: { label: "Not on sponsor register", className: "bg-chip text-muted" },
} as const;

const gbp = (n: number) => (n >= 1000 ? `£${Math.round(n / 1000)}k` : `£${n}`);

function salary(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  if (min && max && max !== min) return `${gbp(min)}–${gbp(max)}`;
  return gbp((min ?? max)!);
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function postedAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 30) return `Posted ${days} days ago`;
  return `Posted ${shortDate(iso)}`;
}

function Chip({ children, className = "bg-chip text-foreground/80" }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>{children}</span>;
}

export function RoleCard({ role }: { role: Role }) {
  const t = role.tags;
  const pay = salary(role.salary_min, role.salary_max);
  const closes = t.deadline ?? role.expires_at;
  const extraLocations = role.locations.length - 1;
  const sponsor = role.sponsor_status ? SPONSOR_BADGE[role.sponsor_status] : null;

  return (
    <article className="relative rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-foreground/20">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-snug tracking-tight">
            <Link href={`/roles/${role.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
              {role.title}
            </Link>
          </h2>
          <p className="mt-1 text-sm text-muted">
            {role.employer}
            {role.location && (
              <>
                <span className="mx-1.5 text-border">•</span>
                {role.location}
                {extraLocations > 0 && ` + ${extraLocations} more`}
              </>
            )}
          </p>
        </div>
        {pay && <span className="shrink-0 text-sm font-medium tabular-nums">{pay}</span>}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {sponsor && (
          <Chip className={sponsor.className}>
            <span title={role.sponsor_name ? `Register entry: ${role.sponsor_name}` : undefined}>{sponsor.label}</span>
          </Chip>
        )}
        {t.sponsorship === "not_offered" && <Chip className="bg-rose-soft text-rose">Says no sponsorship</Chip>}
        {t.graduateScheme && <Chip>Graduate scheme</Chip>}
        <Chip className="bg-accent-soft text-accent">
          {role.start_status === "confirmed" && t.startText ? `Starts ${t.startText}` : "2027 intake"}
        </Chip>
        {t.degree && <Chip>{t.degree} required</Chip>}
        {t.lengthMonths && <Chip>{t.lengthMonths} months</Chip>}
        {t.drivingLicence && <Chip>Driving licence</Chip>}
        {t.stages.map((s) => (
          <Chip key={s}>{s}</Chip>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {role.posted_at && <span>{postedAgo(role.posted_at)}</span>}
        {closes && <span>Closes {shortDate(closes)}</span>}
        {!pay && <span>Salary not stated</span>}
      </div>
    </article>
  );
}

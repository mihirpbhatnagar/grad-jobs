import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CompanyLogo } from "@/components/CompanyLogo";
import { Chip, SponsorTick } from "@/components/RoleCard";
import { SaveButton } from "@/components/SaveButton";
import { currentUser } from "@/lib/auth";
import { companyFor, sizeLabel, type Company } from "@/lib/companies";
import { dateLong, daysUntil, decodeEntities, money, placeName, startLabel } from "@/lib/format";
import type { RoleTags } from "@/lib/roles";
import { estimateFor, fieldOf, salaryContext } from "@/lib/salary";
import { publicClient } from "@/lib/supabase";
import { visaFit, visaSettings } from "@/lib/visa";

type FullRole = {
  id: number;
  title: string;
  employer: string;
  location: string | null;
  locations: string[];
  salary_min: number | null;
  salary_max: number | null;
  salary_text: string | null;
  contract_type: string | null;
  description: string | null;
  apply_url: string | null;
  posted_at: string | null;
  expires_at: string | null;
  tags: RoleTags & { startDate: string | null };
  sponsor_status: "likely" | "unclear" | "not_listed" | null;
  sponsor_name: string | null;
  sources: string[];
  start_status: string | null;
  company_key: string | null;
};

const SOURCE_NAMES: Record<string, string> = { reed: "Reed", google_jobs: "Google Jobs" };
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// ---------- description formatting ----------

type Block = { kind: "h" | "p" | "ul"; lines: string[] };

const HEADING = /^[A-Z0-9][^.!?]{2,70}[:?]?$/;
const BULLET = /^\s*(?:[•●▪◦*\-–]|\d+[.)])\s+/;

// Turns plain description text into headings, paragraphs and bullet lists.
function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = decodeEntities(text).replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+/g, " ").trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const last = blocks[blocks.length - 1];
    if (BULLET.test(line)) {
      const item = line.replace(BULLET, "");
      if (last?.kind === "ul") last.lines.push(item);
      else blocks.push({ kind: "ul", lines: [item] });
    } else if (HEADING.test(line) && line.split(" ").length <= 9 && lines.slice(i + 1).some(Boolean)) {
      blocks.push({ kind: "h", lines: [line.replace(/:$/, "")] });
    } else if (last?.kind === "p" && !/[.!?:]$/.test(last.lines[last.lines.length - 1])) {
      last.lines.push(line);
    } else {
      blocks.push({ kind: "p", lines: [line] });
    }
  }
  return blocks;
}

// Pulls the "what you'll need" part of a description, when it has one.
function requirementsFrom(blocks: Block[]): string[] {
  const start = blocks.findIndex((b) => b.kind === "h" && /(requirement|what you('|’)?ll need|about you|you('|’)?ll have|you will have|skills|qualifications|looking for|essential|experience|criteria|who you are)/i.test(b.lines[0]));
  if (start < 0) return [];
  const out: string[] = [];
  for (const b of blocks.slice(start + 1)) {
    if (b.kind === "h") break;
    out.push(...(b.kind === "ul" ? b.lines : b.lines.join(" ").split(/(?<=\.)\s+/)));
    if (out.length >= 8) break;
  }
  return out.filter((l) => l.length > 3).slice(0, 8);
}

function Description({ blocks }: { blocks: Block[] }) {
  return (
    <div className="mt-4 space-y-4 text-[15px] leading-7 text-foreground/85">
      {blocks.map((b, i) =>
        b.kind === "h" ? (
          <h3 key={i} className="pt-2 text-base font-semibold text-foreground">{b.lines[0]}</h3>
        ) : b.kind === "ul" ? (
          <ul key={i} className="space-y-1.5">
            {b.lines.map((l, j) => (
              <li key={j} className="flex gap-3">
                <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span>{l}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>{b.lines.join(" ")}</p>
        ),
      )}
    </div>
  );
}

// ---------- side panels ----------

function Panel({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 font-semibold tracking-tight">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={icon} />
          </svg>
        </span>
        {title}
      </h2>
      <div className="mt-3 text-sm leading-relaxed text-foreground/85">{children}</div>
    </section>
  );
}

function Fact({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "rose" | "amber" }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`mt-0.5 font-semibold leading-snug ${tone === "rose" ? "text-rose" : tone === "amber" ? "text-amber" : ""}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function CompanyPanel({ company, employer }: { company: Company | null; employer: string }) {
  const facts = company
    ? [
        ["Industry", company.industry && cap(company.industry)],
        ["Headquarters", company.hq],
        ["Founded", company.founded ? `${company.founded} (${new Date().getFullYear() - company.founded} years ago)` : null],
        ["Size", sizeLabel(company.employees)],
      ].filter((f): f is [string, string] => !!f[1])
    : [];
  return (
    <Panel title="The company" icon="M4 21V5l8-3 8 3v16M9 21v-4h6v4M8 8h1M8 12h1M15 8h1M15 12h1">
      <div className="flex items-center gap-3">
        <CompanyLogo name={employer} logoUrl={company?.logo_url} domain={company?.domain} size={44} />
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{company?.name ?? employer}</p>
          {company?.description && <p className="text-xs text-muted">{cap(company.description)}</p>}
        </div>
      </div>
      {company?.summary ? (
        <p className="mt-3">{company.summary}</p>
      ) : (
        <p className="mt-3 text-muted">
          No public company profile found for {employer}. It may be a smaller firm or a recruitment agency hiring for a client.
        </p>
      )}
      {facts.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="font-medium text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-4 rounded-xl bg-chip px-3 py-2.5 text-xs text-muted">
        <span className="font-semibold text-foreground">Values, mission and recent news</span> come in the company brief when you move a role to Apply.
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {company?.website && (
          <a href={company.website} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">
            {company.domain ?? "Website"} ↗
          </a>
        )}
        {company?.wikipedia_url && (
          <a href={company.wikipedia_url} target="_blank" rel="noopener noreferrer" className="text-muted hover:underline">
            From Wikipedia ↗
          </a>
        )}
      </div>
    </Panel>
  );
}

function SalaryBars({ rows }: { rows: { label: string; amount: number; highlight?: boolean }[] }) {
  const max = Math.max(...rows.map((r) => r.amount)) * 1.08;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between text-xs">
            <span className={r.highlight ? "font-semibold text-foreground" : "text-muted"}>{r.label}</span>
            <span className="font-semibold tabular-nums text-foreground">{money(r.amount)}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-chip">
            <div className={`h-2 rounded-full ${r.highlight ? "bg-accent" : "bg-foreground/25"}`} style={{ width: `${(r.amount / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- page ----------

async function RoleDetail({ params }: { params: PageProps<"/roles/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const db = publicClient();
  if (!db || !/^\d+$/.test(id)) notFound();
  const { data } = await db
    .from("roles")
    .select("id,title,employer,location,locations,salary_min,salary_max,salary_text,contract_type,description,apply_url,posted_at,expires_at,tags,sponsor_status,sponsor_name,sources,start_status,company_key")
    .eq("id", Number(id))
    .maybeSingle();
  if (!data) notFound();
  const r = data as FullRole;
  const [{ db: userDb, user }, company, ctx, visa, { data: settings }] = await Promise.all([
    currentUser(),
    companyFor(r.company_key),
    salaryContext(),
    visaSettings(),
    db.from("settings").select("value").eq("key", "visa.standard_salary_gbp").maybeSingle(),
  ]);
  const saved = user ? !!(await userDb.from("saved_roles").select("role_id").eq("role_id", r.id).maybeSingle()).data : false;
  const t = r.tags;
  const closes = t.deadline ?? r.expires_at;
  const days = closes ? daysUntil(closes) : null;
  const blocks = r.description ? toBlocks(r.description) : [];
  const reqs = requirementsFrom(blocks);
  const field = fieldOf(r.title);
  const estimate = r.salary_min || r.salary_max ? null : estimateFor(r.title, ctx);
  const pay = r.salary_max && r.salary_min ? Math.round((r.salary_min + r.salary_max) / 2) : (r.salary_min ?? r.salary_max ?? estimate?.amount ?? null);
  const fit = visaFit(r, visa);
  const fitStyle = { fits: "bg-success-soft text-success", switch: "bg-success-soft text-success", ask: "bg-amber-soft text-amber" }[fit.level];
  const standard = Number(settings?.value ?? 41700);

  const salaryValue =
    r.salary_min && r.salary_max && r.salary_max !== r.salary_min
      ? `${money(r.salary_min)} – ${money(r.salary_max)}`
      : r.salary_min || r.salary_max
        ? money((r.salary_min ?? r.salary_max)!)
        : estimate
          ? `≈ ${money(estimate.amount)}`
          : "Not stated";
  const contract = r.contract_type ? cap(r.contract_type) : t.graduateScheme || t.programmeTitle ? "Graduate scheme" : "Not stated";

  const salaryRows = [
    ...(pay ? [{ label: estimate ? "This role (estimate)" : "This role", amount: pay, highlight: true }] : []),
    ...(field && ctx.byField[field.id] ? [{ label: `Typical ${field.label.split(" ")[0].toLowerCase()} role here`, amount: ctx.byField[field.id].median }] : []),
    ...(ctx.overall ? [{ label: "Typical 2027 graduate role here", amount: ctx.overall }] : []),
    { label: "Visa new-entrant floor", amount: visa.newEntrantSalary },
    { label: "Visa standard threshold", amount: standard },
  ];

  return (
    <>
      <section className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
        <div className="brand-band h-20 sm:h-24" />
        <div className="px-5 pb-6 sm:px-8">
          <div className="-mt-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="rounded-2xl bg-surface p-1 shadow-lg shadow-black/10 sm:self-start">
              <CompanyLogo name={r.employer} logoUrl={company?.logo_url} domain={company?.domain} size={80} />
            </div>
            <div className="flex gap-2">
              <SaveButton roleId={r.id} saved={saved} signedIn={!!user} large />
              {r.apply_url && (
                <a
                  href={r.apply_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/30 hover:opacity-90"
                >
                  View and apply ↗
                </a>
              )}
            </div>
          </div>
          <h1 className="mt-4 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{r.title}</h1>
          <p className="mt-1.5 text-muted">
            <span className="font-medium text-foreground">{company?.name ?? r.employer}</span>
            {r.location && ` · ${placeName(r.location)}`}
            {r.locations.length > 1 && ` + ${r.locations.length - 1} more`}
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <Chip tone="accent">{startLabel(r)}</Chip>
            {r.sponsor_status === "likely" && (
              <Chip tone="success">
                <SponsorTick />
                Licensed sponsor
              </Chip>
            )}
            {(t.graduateScheme || t.programmeTitle) && <Chip>Graduate scheme</Chip>}
            {t.degree && <Chip>{t.degree} degree or above</Chip>}
            {t.sponsorship === "not_offered" && <Chip tone="rose">Says no sponsorship</Chip>}
          </div>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Fact label="Salary" value={salaryValue} sub={estimate ? "Estimate: not stated" : undefined} />
        <Fact label="Location" value={placeName(r.location) ?? "Not stated"} sub={r.locations.length > 1 ? `+ ${r.locations.length - 1} more` : undefined} />
        <Fact label="Starts" value={r.start_status === "confirmed" && t.startText ? t.startText : r.start_status === "likely" ? "2027 intake" : "Not stated"} sub={r.start_status === "likely" ? "Exact month not stated" : undefined} />
        <Fact
          label="Deadline"
          value={closes ? (days !== null && days < 0 ? "May have closed" : dateLong(closes)) : "Not stated"}
          sub={days !== null && days >= 0 ? (days === 0 ? "Closes today" : `${days} day${days === 1 ? "" : "s"} left`) : closes ? undefined : "Apply early: may close when filled"}
          tone={days !== null && days <= 7 ? "rose" : days !== null && days <= 14 ? "amber" : undefined}
        />
        <Fact label="Contract" value={contract} />
        <Fact label="Length" value={t.lengthMonths ? `${t.lengthMonths} months` : "Not stated"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight">About the role</h2>
            {blocks.length > 0 ? (
              <Description blocks={blocks} />
            ) : (
              <p className="mt-3 text-muted">
                The full description isn&apos;t available from our sources yet. We check the employer&apos;s own page daily.{" "}
                {r.apply_url && (
                  <a href={r.apply_url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
                    Read it on the original listing ↗
                  </a>
                )}
              </p>
            )}
          </section>

          <Panel title="Requirements" icon="M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-chip px-3 py-2">
                <dt className="text-xs text-muted">Degree</dt>
                <dd className="font-semibold text-foreground">{t.degree ? `${t.degree} or above` : "Not stated"}</dd>
              </div>
              <div className="rounded-xl bg-chip px-3 py-2">
                <dt className="text-xs text-muted">Driving licence</dt>
                <dd className="font-semibold text-foreground">{t.drivingLicence ? "Required" : "Not mentioned"}</dd>
              </div>
              <div className="rounded-xl bg-chip px-3 py-2">
                <dt className="text-xs text-muted">Sponsorship wording</dt>
                <dd className="font-semibold text-foreground">{t.sponsorship === "not_offered" ? "Says none" : t.sponsorship === "offered" ? "Offered" : "Not mentioned"}</dd>
              </div>
            </dl>
            {reqs.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {reqs.map((l, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <CompanyPanel company={company} employer={r.employer} />

          <Panel title="Visa" icon="M4 7h16v12H4zM8 7V5h8v2M9 12h6">
            <p className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${fitStyle}`}>{fit.label}</p>
            <p className="mt-2">{fit.detail}</p>
            {r.sponsor_status === "likely" && (
              <p className="mt-2 flex items-start gap-1.5 font-medium text-success">
                <SponsorTick />
                <span>Licensed sponsor{r.sponsor_name ? ` (registered as ${r.sponsor_name})` : ""}.</span>
              </p>
            )}
            {t.sponsorship === "not_offered" && <p className="mt-2 font-medium text-rose">The listing says it can&apos;t offer sponsorship.</p>}
            <p className="mt-2 text-xs text-muted">On the Graduate visa any employer can hire you without sponsorship.</p>
          </Panel>

          <Panel title="Process" icon="M5 12h14M13 6l6 6-6 6">
            {t.stages.length > 0 ? (
              <ol className="space-y-2">
                {[...t.stages, "Offer"].map((s, i) => (
                  <li key={s} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted">The listing doesn&apos;t describe its stages. Most graduate schemes run online tests, a video interview, then an assessment centre.</p>
            )}
          </Panel>

          <Panel title="Salary context" icon="M4 20V10M10 20V4M16 20v-7M22 20H2">
            <SalaryBars rows={salaryRows} />
            <p className="mt-3 text-xs text-muted">
              &quot;Typical&quot; is the middle salary of the 2027 graduate roles in this app that state one. Visa figures are from GOV.UK; a Skilled Worker
              switch also needs 70% of the job&apos;s going rate.
            </p>
          </Panel>

          <p className="px-1 text-xs text-muted">
            Found via {r.sources.map((s) => SOURCE_NAMES[s] ?? s).join(" and ")}
            {r.posted_at && ` · posted ${dateLong(r.posted_at)}`}
          </p>
        </div>
      </div>
    </>
  );
}

export default function RolePage(props: PageProps<"/roles/[id]">) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6">
      <Link href="/" className="text-sm font-medium text-muted hover:text-foreground">
        ← All roles
      </Link>
      <div className="mt-4">
        <Suspense fallback={<div className="h-[60vh] animate-pulse rounded-3xl bg-chip" />}>
          <RoleDetail params={props.params} />
        </Suspense>
      </div>
    </main>
  );
}

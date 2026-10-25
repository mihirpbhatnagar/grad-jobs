import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { RoleTags } from "@/lib/roles";
import { publicClient } from "@/lib/supabase";

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
};

const SOURCE_NAMES: Record<string, string> = { reed: "Reed", google_jobs: "Google Jobs" };

// Older listings were stored with some HTML codes (e.g. "&#163;" for £) still in the text.
const decodeEntities = (text: string) =>
  text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&pound;/g, "£")
    .replace(/&amp;/g, "&");

const money = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function salaryLabel(r: FullRole): string {
  if (r.salary_min && r.salary_max && r.salary_max !== r.salary_min) return `${money(r.salary_min)} – ${money(r.salary_max)}`;
  if (r.salary_min || r.salary_max) return money((r.salary_min ?? r.salary_max)!);
  return r.salary_text?.trim() || "Not stated";
}

function closesLabel(iso: string | null): string {
  if (!iso) return "Not stated";
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "May have closed";
  if (days === 0) return "Today";
  return days <= 14 ? `In ${days} day${days === 1 ? "" : "s"}` : dateLabel(iso);
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-chip px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 font-medium leading-snug">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-foreground/85">{children}</div>
    </section>
  );
}

async function RoleDetail({ params }: { params: PageProps<"/roles/[id]">["params"] }) {
  const { id } = await params;
  const db = publicClient();
  if (!db || !/^\d+$/.test(id)) notFound();
  const { data } = await db
    .from("roles")
    .select("id,title,employer,location,locations,salary_min,salary_max,salary_text,contract_type,description,apply_url,posted_at,expires_at,tags,sponsor_status,sponsor_name,sources,start_status")
    .eq("id", Number(id))
    .maybeSingle();
  if (!data) notFound();
  const r = data as FullRole;
  const t = r.tags;
  const closes = t.deadline ?? r.expires_at;
  const start = r.start_status === "confirmed" && t.startText ? t.startText : r.start_status === "likely" ? "2027 intake" : "Not stated";

  const sponsorLine = {
    likely: `On the Home Office sponsor register${r.sponsor_name ? ` as ${r.sponsor_name}` : ""}. If the scheme runs past your 18-month Graduate visa, they can sponsor a switch to a Skilled Worker visa.`,
    unclear: `Possibly on the sponsor register${r.sponsor_name ? ` (closest match: ${r.sponsor_name})` : ""}. Worth asking early if the scheme is longer than 18 months.`,
    not_listed: "Not found on the sponsor register. Fine for 18 months on the Graduate visa; ask early if the role runs longer.",
  }[r.sponsor_status ?? "not_listed"];

  return (
    <>
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-lg font-semibold text-accent">
          {r.employer.trim()[0]?.toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{r.title}</h1>
          <p className="mt-1 text-muted">
            {r.employer}
            {r.location && ` · ${r.location}`}
            {r.locations.length > 1 && ` + ${r.locations.length - 1} more`}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fact label="Salary" value={salaryLabel(r)} />
        <Fact label="Starts" value={start} />
        <Fact label="Closes" value={closesLabel(closes)} />
        <Fact label="Contract" value={r.contract_type ? r.contract_type[0].toUpperCase() + r.contract_type.slice(1) : t.lengthMonths ? `${t.lengthMonths} months` : "Not stated"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold tracking-tight">About the role</h2>
          {r.description ? (
            <div className="mt-3 whitespace-pre-line text-[15px] leading-7 text-foreground/85">{decodeEntities(r.description)}</div>
          ) : (
            <p className="mt-3 text-muted">This listing came from Google Jobs, which doesn&apos;t include the full description. Open the original listing to read it.</p>
          )}
        </section>

        <div className="space-y-4">
          {r.apply_url && (
            <a
              href={r.apply_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center rounded-xl bg-foreground px-4 py-3 font-medium text-background hover:opacity-90"
            >
              View and apply ↗
            </a>
          )}
          <Panel title="Visa">
            <p>{sponsorLine}</p>
            {t.sponsorship === "not_offered" && <p className="mt-2 font-medium text-rose">The listing says it can&apos;t offer sponsorship.</p>}
          </Panel>
          <Panel title="Requirements">
            <ul className="space-y-1">
              <li>Degree: {t.degree ? `${t.degree} or above` : "not stated"}</li>
              <li>Driving licence: {t.drivingLicence ? "required" : "not mentioned"}</li>
            </ul>
          </Panel>
          {t.stages.length > 0 && (
            <Panel title="Process">
              <p>{t.stages.join(" → ")}</p>
            </Panel>
          )}
          <p className="px-1 text-xs text-muted">
            Found via {r.sources.map((s) => SOURCE_NAMES[s] ?? s).join(" and ")}
            {r.posted_at && ` · posted ${dateLabel(r.posted_at)}`}
          </p>
        </div>
      </div>
    </>
  );
}

export default function RolePage(props: PageProps<"/roles/[id]">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6">
      <Link href="/" className="text-sm text-muted hover:text-foreground">← All roles</Link>
      <div className="mt-4">
        <Suspense fallback={<div className="h-[60vh] animate-pulse rounded-2xl bg-chip" />}>
          <RoleDetail params={props.params} />
        </Suspense>
      </div>
    </main>
  );
}

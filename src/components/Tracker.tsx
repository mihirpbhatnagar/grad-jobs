import Link from "next/link";
import { connection } from "next/server";
import { StageSelect } from "@/components/StageControls";
import { currentUser } from "@/lib/auth";
import { employerLabel } from "@/lib/format";
import { RESPONDED, type Stage } from "@/lib/pipeline";

type Row = {
  id: number;
  stage: Stage;
  company: string | null;
  title: string | null;
  closes_on: string | null;
  updated_at: string;
  role: { id: number; title: string; employer: string; expires_at: string | null; is_open: boolean; tags: { deadline: string | null } } | null;
};

// In progress first, then still to apply, then outcomes.
const ORDER: Record<Stage, number> = { applied: 0, test: 0, interview: 0, assessment_centre: 0, saved: 1, applying: 1, offer: 2, rejected: 2 };

// The closing date we hold for a saved role: the listing's own, or the one typed in by hand.
const closingDate = (row: Row): string | null => (row.role ? (row.role.tags.deadline ?? row.role.expires_at) : row.closes_on);

// Whole days from today to a date (0 = today, negative = passed).
const daysUntil = (iso: string) => Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000);

const closesIn = (days: number) => (days < 0 ? "May have closed" : days === 0 ? "Closes today" : days === 1 ? "Closes tomorrow" : `Closes in ${days} days`);

// A short warning under the role: deadline close, listing gone, or no reply for a while.
function warning(row: Row, noReplyWeeks: number): string | null {
  if (row.stage === "applied") {
    const weeks = Math.floor((Date.now() - new Date(row.updated_at).getTime()) / (7 * 86_400_000));
    return weeks >= noReplyWeeks ? `No reply for ${weeks} weeks` : null;
  }
  if (row.stage !== "saved" && row.stage !== "applying") return null;
  if (row.role && !row.role.is_open) return "Listing may have closed";
  const iso = closingDate(row);
  if (!iso) return null;
  const days = daysUntil(iso);
  return days <= 7 ? closesIn(days) : null;
}

// Roles saved but not yet applied for whose closing date is within three weeks, soonest first.
const CLOSING_WITHIN_DAYS = 21;
function ClosingSoon({ rows }: { rows: Row[] }) {
  const closing = rows
    .filter((r) => r.stage === "saved" || r.stage === "applying")
    .map((row) => ({ row, iso: closingDate(row) }))
    .filter((c): c is { row: Row; iso: string } => !!c.iso && (!c.row.role || c.row.role.is_open))
    .map((c) => ({ ...c, days: daysUntil(c.iso) }))
    .filter((c) => c.days >= 0 && c.days <= CLOSING_WITHIN_DAYS)
    .sort((a, b) => a.days - b.days);
  if (!closing.length) return null;
  return (
    <div className="rounded-2xl border border-rose/30 bg-surface p-5">
      <h2 className="font-semibold tracking-tight">Closing soon</h2>
      <p className="mt-1 text-xs text-muted">Saved roles you haven&apos;t applied for yet, closing in the next three weeks.</p>
      <ul className="mt-3 space-y-1">
        {closing.map(({ row, iso, days }) => (
          <li key={row.id}>
            <Link href={row.role ? `/roles/${row.role.id}` : `/applications/${row.id}`} className="flex items-start justify-between gap-3 rounded-xl px-2 py-2 hover:bg-chip">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{row.role ? employerLabel(row.role.employer) : row.company}</span>
                <span className="line-clamp-2 text-xs text-muted">{row.role?.title ?? row.title}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className={`block text-sm font-semibold ${days <= 3 ? "text-rose" : "text-foreground"}`}>{days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days`}</span>
                <span className="block text-xs text-muted">{new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-chip px-3 py-2.5">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

// Every saved role and application for the signed-in user, as one table: company, role, status.
export async function Tracker() {
  await connection();
  const { db, user } = await currentUser();
  if (!user) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-semibold tracking-tight">Your applications</h2>
        <p className="mt-2 text-sm text-muted">Sign in to save roles and track every application in one place.</p>
        <Link href="/sign-in?next=/my-jobs" className="mt-4 inline-flex rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background">
          Sign in
        </Link>
      </div>
    );
  }

  const [{ data }, { data: setting }] = await Promise.all([
    db.from("saved_roles").select("id,stage,company,title,closes_on,updated_at,role:roles(id,title,employer,expires_at,is_open,tags)").order("updated_at", { ascending: false }),
    db.from("settings").select("value").eq("key", "inbox.no_reply_weeks").maybeSingle(),
  ]);
  const noReplyWeeks = Number(setting?.value ?? 4);
  const rows = ((data ?? []) as unknown as Row[])
    .filter((r) => r.role || r.title)
    .sort((a, b) => ORDER[a.stage] - ORDER[b.stage]);

  const applied = rows.filter((r) => !["saved", "applying"].includes(r.stage));
  const responded = applied.filter((r) => RESPONDED.includes(r.stage));
  const interviews = rows.filter((r) => r.stage === "interview" || r.stage === "assessment_centre").length;
  const rate = applied.length ? `${Math.round((responded.length / applied.length) * 100)}%` : "–";

  return (
    <>
    <ClosingSoon rows={rows} />
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold tracking-tight">Your applications</h2>
        <Link href="/applications/new" className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:border-foreground/30">
          + Add
        </Link>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Saved" value={rows.length - applied.length} />
        <Stat label="Applied" value={applied.length} />
        <Stat label="Interviews" value={interviews} />
        <Stat label="Replies" value={rate} />
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Tap the bookmark on any role to save it here, or add an application you made elsewhere.</p>
      ) : (
        <table className="w-full table-fixed text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="w-[32%] pb-2 font-medium">Company</th>
              <th className="pb-2 font-medium">Role</th>
              <th className="w-[34%] pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const href = row.role ? `/roles/${row.role.id}` : `/applications/${row.id}`;
              const note = warning(row, noReplyWeeks);
              return (
                <tr key={row.id} className="border-b border-border/60 align-top last:border-0">
                  <td className="py-2.5 pr-2">
                    <Link href={href} className="line-clamp-2 font-medium hover:underline">
                      {row.role ? employerLabel(row.role.employer) : row.company}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-2">
                    <Link href={href} className="line-clamp-2 text-foreground/85 hover:underline">
                      {row.role?.title ?? row.title}
                    </Link>
                    {note && <span className="mt-0.5 block text-xs text-rose">{note}</span>}
                  </td>
                  <td className="py-2">
                    <StageSelect applicationId={row.id} stage={row.stage} compact />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
    </>
  );
}

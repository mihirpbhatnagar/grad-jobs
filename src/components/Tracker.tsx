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
  role: { id: number; title: string; employer: string; expires_at: string | null; is_open: boolean; tags: { deadline: string | null } } | null;
};

// In progress first, then still to apply, then outcomes.
const ORDER: Record<Stage, number> = { applied: 0, test: 0, interview: 0, assessment_centre: 0, saved: 1, applying: 1, offer: 2, rejected: 2 };

// A short warning under the role when the deadline is close or the listing has gone.
function warning(row: Row): string | null {
  if (row.stage !== "saved" && row.stage !== "applying") return null;
  if (row.role && !row.role.is_open) return "Listing may have closed";
  const iso = row.role ? (row.role.tags.deadline ?? row.role.expires_at) : row.closes_on;
  if (!iso) return null;
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "May have closed";
  if (days === 0) return "Closes today";
  return days <= 7 ? `Closes in ${days} day${days === 1 ? "" : "s"}` : null;
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

  const { data } = await db
    .from("saved_roles")
    .select("id,stage,company,title,closes_on,role:roles(id,title,employer,expires_at,is_open,tags)")
    .order("updated_at", { ascending: false });
  const rows = ((data ?? []) as unknown as Row[])
    .filter((r) => r.role || r.title)
    .sort((a, b) => ORDER[a.stage] - ORDER[b.stage]);

  const applied = rows.filter((r) => !["saved", "applying"].includes(r.stage));
  const responded = applied.filter((r) => RESPONDED.includes(r.stage));
  const interviews = rows.filter((r) => r.stage === "interview" || r.stage === "assessment_centre").length;
  const rate = applied.length ? `${Math.round((responded.length / applied.length) * 100)}%` : "–";

  return (
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
              const note = warning(row);
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
  );
}

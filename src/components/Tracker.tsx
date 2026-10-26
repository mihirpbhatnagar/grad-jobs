import Link from "next/link";
import { connection } from "next/server";
import { StageControls } from "@/components/StageControls";
import { currentUser } from "@/lib/auth";
import { RESPONDED, stageLabel, type Stage } from "@/lib/pipeline";

type Row = {
  stage: Stage;
  saved_at: string;
  applied_at: string | null;
  role: { id: number; title: string; employer: string; expires_at: string | null; is_open: boolean; tags: { deadline: string | null } } | null;
};

function closes(row: Row): string | null {
  const iso = row.role?.tags.deadline ?? row.role?.expires_at;
  if (!iso) return null;
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "May have closed";
  if (days === 0) return "Closes today";
  return `Closes in ${days} day${days === 1 ? "" : "s"}`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-chip px-3 py-2.5">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function Group({ title, rows }: { title: string; rows: Row[] }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
        {title} · {rows.length}
      </h3>
      <ul className="mt-2 space-y-2">
        {rows.map((row) => {
          const due = closes(row);
          const urgent = due && /today|in [1-7] days?$/.test(due);
          return (
            <li key={row.role!.id} className="rounded-xl border border-border bg-background p-3">
              <Link href={`/roles/${row.role!.id}`} className="block hover:opacity-80">
                <span className="line-clamp-2 text-sm font-medium leading-snug">{row.role!.title}</span>
                <span className="mt-0.5 block truncate text-xs text-muted">{row.role!.employer}</span>
              </Link>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className={`text-xs ${!row.role!.is_open || urgent ? "text-rose" : "text-muted"}`}>
                  {!row.role!.is_open ? "Listing may have closed" : row.stage === "saved" || row.stage === "applying" ? due ?? "No deadline stated" : stageLabel(row.stage)}
                </span>
                <StageControls roleId={row.role!.id} stage={row.stage} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Saved roles, application pipeline and dashboard numbers for the signed-in user.
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
    .select("stage,saved_at,applied_at,role:roles(id,title,employer,expires_at,is_open,tags)")
    .order("updated_at", { ascending: false });
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.role);

  const applied = rows.filter((r) => !["saved", "applying"].includes(r.stage));
  const responded = applied.filter((r) => RESPONDED.includes(r.stage));
  const interviews = rows.filter((r) => r.stage === "interview" || r.stage === "assessment_centre").length;
  const rate = applied.length ? `${Math.round((responded.length / applied.length) * 100)}%` : "–";

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-surface p-5">
      <h2 className="font-semibold tracking-tight">Your applications</h2>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Saved" value={rows.length - applied.length} />
        <Stat label="Applied" value={applied.length} />
        <Stat label="Interviews" value={interviews} />
        <Stat label="Response rate" value={rate} />
      </div>
      {rows.length === 0 && <p className="text-sm text-muted">Tap the bookmark on any role to save it here.</p>}
      <Group title="To apply" rows={rows.filter((r) => r.stage === "saved" || r.stage === "applying")} />
      <Group title="In progress" rows={rows.filter((r) => ["applied", "test", "interview", "assessment_centre"].includes(r.stage))} />
      <Group title="Outcomes" rows={rows.filter((r) => r.stage === "offer" || r.stage === "rejected")} />
    </div>
  );
}

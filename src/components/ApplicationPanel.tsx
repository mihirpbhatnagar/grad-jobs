import { AddUpdate, DateField, DeleteUpdate, DocumentSlot, RemoveApplication } from "@/components/ApplicationControls";
import { StageSelect } from "@/components/StageControls";
import { userClient } from "@/lib/auth";
import { dateLong, dateShort } from "@/lib/format";
import { stageLabel } from "@/lib/pipeline";

export type Application = {
  id: number;
  role_id: number | null;
  stage: string;
  saved_at: string;
  applied_at: string | null;
  closes_on: string | null;
  cv_path: string | null;
  cv_name: string | null;
  cover_path: string | null;
  cover_name: string | null;
};

export const APPLICATION_COLUMNS = "id,role_id,stage,saved_at,applied_at,closes_on,cv_path,cv_name,cover_path,cover_name";

type Event = { id: number; stage: string | null; note: string | null; happened_at: string };

// "Your application" on a saved role: status, dates, the documents actually sent, and updates.
// `roleCloses` is the listing's own deadline; roles added by hand keep an editable closing date.
export async function ApplicationPanel({ app, userId, roleCloses, removeRedirect }: { app: Application; userId: string; roleCloses?: string | null; removeRedirect?: string }) {
  const db = await userClient();
  const [{ data: events }, { data: profile }, signed] = await Promise.all([
    db.from("application_events").select("id,stage,note,happened_at").eq("application_id", app.id).order("happened_at", { ascending: false }),
    db.from("profiles").select("cv_path").maybeSingle(),
    Promise.all(
      [app.cv_path, app.cover_path].map(async (p) => (p ? (await db.storage.from("cvs").createSignedUrl(p, 3600)).data?.signedUrl ?? null : null)),
    ),
  ]);
  const supabase = { url: process.env.SUPABASE_URL!, key: process.env.SUPABASE_PUBLISHABLE_KEY!, userId };
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

  return (
    <section className="rounded-2xl border-2 border-accent/25 bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold tracking-tight">Your application</h2>
        <StageSelect applicationId={app.id} stage={app.stage} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-chip px-3 py-2.5">
          <div className="text-xs text-muted">Saved</div>
          <div className="mt-0.5 text-sm font-semibold">{dateLong(app.saved_at)}</div>
        </div>
        <div className="rounded-xl bg-chip px-3 py-2.5">
          <div className="text-xs text-muted">Applied on</div>
          <DateField applicationId={app.id} field="appliedOn" value={day(app.applied_at)} />
        </div>
        <div className="rounded-xl bg-chip px-3 py-2.5">
          <div className="text-xs text-muted">Closing date</div>
          {app.role_id ? (
            <div className="mt-0.5 text-sm font-semibold">{roleCloses ? dateLong(roleCloses) : "Not stated"}</div>
          ) : (
            <DateField applicationId={app.id} field="closesOn" value={app.closes_on} />
          )}
        </div>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <DocumentSlot applicationId={app.id} kind="cv" current={app.cv_name ? { name: app.cv_name, url: signed[0] } : null} hasProfileCv={!!profile?.cv_path} supabase={supabase} />
        <DocumentSlot applicationId={app.id} kind="cover" current={app.cover_name ? { name: app.cover_name, url: signed[1] } : null} hasProfileCv={false} supabase={supabase} />
      </div>

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Updates</h3>
      <div className="mt-2">
        <AddUpdate applicationId={app.id} />
      </div>
      <ol className="mt-3 space-y-2.5 border-l-2 border-border pl-4">
        {((events ?? []) as Event[]).map((e) => (
          <li key={e.id} className="relative text-sm">
            <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${e.note ? "bg-foreground/40" : "bg-accent"}`} />
            <div className="flex items-start justify-between gap-3">
              <span>{e.note ?? (e.stage === "saved" ? "Saved" : `Status: ${stageLabel(e.stage ?? "")}`)}</span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                {dateShort(e.happened_at)}
                {e.note && <DeleteUpdate eventId={e.id} />}
              </span>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-4 border-t border-border pt-3">
        <RemoveApplication applicationId={app.id} redirectTo={removeRedirect} />
      </div>
    </section>
  );
}

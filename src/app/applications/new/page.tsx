import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { addManualApplication } from "@/lib/myjobs-actions";
import { STAGES } from "@/lib/pipeline";

const input = "mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-3 outline-none focus:border-foreground/40";

async function Form() {
  await requireUser("/applications/new");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={addManualApplication} className="space-y-4 rounded-2xl border border-border bg-surface p-6 sm:p-8">
      <label className="block">
        <span className="text-sm font-medium">Company</span>
        <input name="company" required maxLength={120} placeholder="Unilever" className={input} />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Role</span>
        <input name="title" required maxLength={200} placeholder="Future Leaders Programme: Marketing" className={input} />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Link to the listing <span className="font-normal text-muted">(optional)</span></span>
        <input name="url" type="url" placeholder="https://careers.unilever.com/..." className={input} />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium">Status</span>
          <select name="stage" defaultValue="applied" className={input}>
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Applied on</span>
          <input name="appliedOn" type="date" defaultValue={today} className={input} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Closing date</span>
          <input name="closesOn" type="date" className={input} />
        </label>
      </div>
      <button type="submit" className="w-full rounded-xl bg-foreground py-3 font-medium text-background hover:opacity-90">
        Add application
      </button>
    </form>
  );
}

// An application for a role that isn't in the app, so the tracker and stats stay complete.
export default function NewApplicationPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-8 sm:px-6">
      <Link href="/my-jobs" className="text-sm font-medium text-muted hover:text-foreground">
        ← My jobs
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Add an application</h1>
      <p className="mt-2 text-muted">For a role you found somewhere else. You can add the CV and cover letter you sent on the next page.</p>
      <div className="mt-6">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-chip" />}>
          <Form />
        </Suspense>
      </div>
    </main>
  );
}

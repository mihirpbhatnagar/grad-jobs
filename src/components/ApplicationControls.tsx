"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addUpdate, deleteUpdate, recordDocument, removeApplication, setDates, setStage } from "@/lib/myjobs-actions";

// One click once the form is sent: sets the status to Applied (and today's date).
export function MarkApplied({ applicationId }: { applicationId: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => setStage(applicationId, "applied"))}
      className="rounded-xl border border-success/40 bg-success-soft px-4 py-2.5 text-sm font-semibold text-success hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Saving…" : "I've applied ✓"}
    </button>
  );
}

export function DateField({ applicationId, field, value }: { applicationId: number; field: "appliedOn" | "closesOn"; value: string | null }) {
  const [pending, start] = useTransition();
  return (
    <input
      type="date"
      defaultValue={value ?? ""}
      disabled={pending}
      onChange={(e) => start(() => setDates(applicationId, { [field]: e.target.value || null }))}
      className="mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-1 text-sm font-semibold"
    />
  );
}

// The CV or cover letter sent with this application: upload the exact file, or reuse the profile CV.
export function DocumentSlot({
  applicationId,
  kind,
  current,
  hasProfileCv,
  supabase,
}: {
  applicationId: number;
  kind: "cv" | "cover";
  current: { name: string; url: string | null } | null;
  hasProfileCv: boolean;
  supabase: { url: string; key: string; userId: string };
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "busy" | "error">("idle");
  const [error, setError] = useState("");

  async function upload(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      setStatus("error");
      setError("That file is over 5 MB.");
      return;
    }
    setStatus("busy");
    const db = createBrowserClient(supabase.url, supabase.key);
    const safe = file.name.replace(/[^\w.\- ]+/g, "_");
    const path = `${supabase.userId}/applications/${applicationId}/${kind}-${Date.now()}-${safe}`;
    const { error: upErr } = await db.storage.from("cvs").upload(path, file, { contentType: file.type });
    if (upErr) {
      setStatus("error");
      setError("Upload failed. Use a PDF, Word or text file under 5 MB.");
      return;
    }
    await recordDocument(applicationId, kind, path, file.name);
    setStatus("idle");
    router.refresh();
  }

  async function useProfileCv() {
    setStatus("busy");
    try {
      await recordDocument(applicationId, "cv", "profile", "");
      setStatus("idle");
      router.refresh();
    } catch {
      setStatus("error");
      setError("Couldn't copy your profile CV.");
    }
  }

  const label = kind === "cv" ? "CV" : "Cover letter";
  return (
    <div className="rounded-xl bg-chip px-3 py-2.5">
      <div className="text-xs text-muted">{label} sent</div>
      {current ? (
        current.url ? (
          <a href={current.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 block truncate text-sm font-semibold text-accent hover:underline">
            {current.name}
          </a>
        ) : (
          <div className="mt-0.5 truncate text-sm font-semibold">{current.name}</div>
        )
      ) : (
        <div className="mt-0.5 text-sm text-muted">Not added yet</div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <label className="cursor-pointer rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium hover:border-foreground/30">
          {status === "busy" ? "Saving…" : current ? "Replace" : "Upload"}
          <input
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            className="sr-only"
            disabled={status === "busy"}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </label>
        {kind === "cv" && hasProfileCv && !current && (
          <button type="button" onClick={useProfileCv} disabled={status === "busy"} className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium hover:border-foreground/30">
            Use my profile CV
          </button>
        )}
      </div>
      {status === "error" && <p className="mt-1 text-xs text-rose">{error}</p>}
    </div>
  );
}

export function AddUpdate({ applicationId }: { applicationId: number }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await addUpdate(applicationId, text);
          setText("");
        });
      }}
      className="flex gap-2"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Online test invite, due 12 Nov"
        maxLength={500}
        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
      />
      <button type="submit" disabled={pending || !text.trim()} className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50">
        Add
      </button>
    </form>
  );
}

export function DeleteUpdate({ eventId }: { eventId: number }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" aria-label="Delete update" disabled={pending} onClick={() => start(() => deleteUpdate(eventId))} className="text-xs text-muted hover:text-rose">
      ✕
    </button>
  );
}

export function RemoveApplication({ applicationId, redirectTo }: { applicationId: number; redirectTo?: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="text-xs text-muted hover:text-rose">
        Remove from my jobs
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="text-muted">Remove it, with its documents and updates?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await removeApplication(applicationId);
            if (redirectTo) router.push(redirectTo);
          })
        }
        className="font-semibold text-rose"
      >
        Remove
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-muted">
        Cancel
      </button>
    </span>
  );
}

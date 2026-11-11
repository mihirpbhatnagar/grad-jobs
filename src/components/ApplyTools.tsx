"use client";

import { useState, useTransition } from "react";
import { ESTIMATE_PENCE, type ToolKind } from "@/lib/ai";
import { runApplyTool, saveEditedRewrite } from "@/lib/apply-actions";

export type Saved = { kind: ToolKind; content: string; created_at: string };

const BUTTONS: { kind: ToolKind; label: string; hint: string }[] = [
  { kind: "brief", label: "Company brief", hint: "What they do, values, news, what they want in grads" },
  { kind: "cv", label: "CV recommendations", hint: "What to lead with, strengthen and cut" },
  { kind: "rewrite", label: "CV rewrite", hint: "Your CV tailored to this role, from your real experience" },
  { kind: "cover", label: "Cover letter pointers", hint: "A structure and 4–6 points (never the letter itself)" },
];

// Light formatting for the tools' output: ## headings, - bullets, paragraphs.
function Formatted({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-6 text-foreground/85">
      {text.split(/\n{2,}/).map((block, i) => {
        const lines = block.split("\n").filter(Boolean);
        if (lines.every((l) => /^\s*[-•*]\s/.test(l))) {
          return (
            <ul key={i} className="space-y-1">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span>{l.replace(/^\s*[-•*]\s/, "").replace(/\*\*/g, "")}</span>
                </li>
              ))}
            </ul>
          );
        }
        return lines.map((l, j) =>
          /^#{1,4}\s/.test(l) ? (
            <h4 key={`${i}-${j}`} className="pt-2 font-semibold text-foreground">{l.replace(/^#+\s/, "")}</h4>
          ) : /^\s*[-•*]\s/.test(l) ? (
            <p key={`${i}-${j}`} className="pl-4">• {l.replace(/^\s*[-•*]\s/, "").replace(/\*\*/g, "")}</p>
          ) : (
            <p key={`${i}-${j}`}>{l.replace(/\*\*/g, "")}</p>
          ),
        );
      })}
    </div>
  );
}

export function ApplyTools({ roleId, initial, enabled, signedIn, kinds, quietWhenOff }: { roleId: number; initial: Saved[]; enabled: boolean; signedIn: boolean; kinds?: ToolKind[]; quietWhenOff?: boolean }) {
  const buttons = kinds ? BUTTONS.filter((b) => kinds.includes(b.kind)) : BUTTONS;
  const [results, setResults] = useState<Partial<Record<ToolKind, Saved>>>(() => Object.fromEntries(initial.map((s) => [s.kind, s])));
  const [open, setOpen] = useState<ToolKind | null>(initial.find((s) => buttons.some((b) => b.kind === s.kind))?.kind ?? null);
  const [busy, setBusy] = useState<ToolKind | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [, start] = useTransition();

  if (!signedIn) return <p className="text-sm text-muted">Sign in to use the Apply tools.</p>;
  if (!enabled && quietWhenOff) return null;
  if (!enabled) {
    return (
      <p className="rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted">
        <span className="font-medium text-foreground">Built, waiting to be switched on:</span> {buttons.map((b) => `${b.label.toLowerCase()} (about ${ESTIMATE_PENCE[b.kind]}p a go)`).join(", ")}. It uses paid AI, so it stays off until you say so.
      </p>
    );
  }

  const run = (kind: ToolKind) =>
    start(async () => {
      setBusy(kind);
      setError("");
      const res = await runApplyTool(kind, roleId);
      setBusy(null);
      if (!res.ok) return setError(res.error);
      setResults((r) => ({ ...r, [kind]: { kind, content: res.text, created_at: res.createdAt } }));
      setOpen(kind);
    });

  const shown = open ? results[open] : undefined;
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {buttons.map((b) => (
          <button
            key={b.kind}
            type="button"
            disabled={!!busy}
            onClick={() => (results[b.kind] ? setOpen(b.kind) : run(b.kind))}
            className={`rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${open === b.kind ? "border-accent bg-accent-soft" : "border-border hover:border-accent/50"}`}
          >
            <span className="block text-sm font-semibold">
              {busy === b.kind ? "Working… (up to a minute)" : b.label}
              {results[b.kind] ? (
                <span className="ml-1.5 text-xs font-medium text-success">✓ ready</span>
              ) : (
                <span className="ml-1.5 text-xs font-normal text-muted">~{ESTIMATE_PENCE[b.kind]}p</span>
              )}
            </span>
            <span className="block text-xs text-muted">{b.hint}</span>
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-rose">{error}</p>}
      {shown && (
        <div className="rounded-xl bg-chip p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted">Saved {new Date(shown.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
            <span className="flex gap-3">
              {shown.kind === "rewrite" && editing === null && (
                <button type="button" onClick={() => setEditing(shown.content)} className="text-xs font-semibold text-accent hover:underline">
                  Edit as my version
                </button>
              )}
              <button type="button" disabled={!!busy} onClick={() => run(shown.kind)} className="text-xs font-semibold text-accent hover:underline">
                Redo (~{ESTIMATE_PENCE[shown.kind]}p)
              </button>
            </span>
          </div>
          {shown.kind === "rewrite" && editing !== null ? (
            <div>
              <textarea value={editing} onChange={(e) => setEditing(e.target.value)} rows={18} className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-accent" />
              <div className="mt-2 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setEditing(null)} className="text-xs text-muted hover:text-foreground">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() =>
                    start(async () => {
                      const { createdAt } = await saveEditedRewrite(roleId, editing);
                      setResults((r) => ({ ...r, rewrite: { kind: "rewrite", content: editing, created_at: createdAt } }));
                      setEditing(null);
                    })
                  }
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Save my version
                </button>
              </div>
              <p className="mt-1 text-xs text-muted">Your edits teach later rewrites how you like to sound. Saving is free.</p>
            </div>
          ) : (
            <Formatted text={shown.content} />
          )}
        </div>
      )}
      <p className="text-xs text-muted">Built only from your CV, story bank and style notes. It never writes your cover letter or invents experience. Each run costs the pence shown and is saved, so you never pay twice.</p>
    </div>
  );
}

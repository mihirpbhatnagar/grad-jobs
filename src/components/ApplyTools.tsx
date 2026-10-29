"use client";

import { useState, useTransition } from "react";
import type { ToolKind } from "@/lib/ai";
import { runApplyTool } from "@/lib/apply-actions";

export type Saved = { kind: ToolKind; content: string; created_at: string };

const BUTTONS: { kind: ToolKind; label: string; hint: string }[] = [
  { kind: "brief", label: "Company brief", hint: "What they do, values, news, what they want in grads" },
  { kind: "keywords", label: "Keyword gaps", hint: "What the job asks for vs your CV" },
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

export function ApplyTools({ roleId, initial, enabled, signedIn }: { roleId: number; initial: Saved[]; enabled: boolean; signedIn: boolean }) {
  const [results, setResults] = useState<Partial<Record<ToolKind, Saved>>>(() => Object.fromEntries(initial.map((s) => [s.kind, s])));
  const [open, setOpen] = useState<ToolKind | null>(initial[0]?.kind ?? null);
  const [busy, setBusy] = useState<ToolKind | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [, start] = useTransition();

  if (!signedIn) return <p className="text-sm text-muted">Sign in to use the Apply tools.</p>;
  if (!enabled) return <p className="text-sm text-muted">Company brief, keyword gaps, CV help and cover letter pointers switch on once the Anthropic key is added.</p>;

  const run = (kind: ToolKind) =>
    start(async () => {
      setBusy(kind);
      setError("");
      const res = await runApplyTool(kind, roleId, kind === "ai_check" ? draft : undefined);
      setBusy(null);
      if (!res.ok) return setError(res.error);
      setResults((r) => ({ ...r, [kind]: { kind, content: res.text, created_at: res.createdAt } }));
      setOpen(kind);
    });

  const shown = open ? results[open] : undefined;
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {BUTTONS.map((b) => (
          <button
            key={b.kind}
            type="button"
            disabled={!!busy}
            onClick={() => (results[b.kind] ? setOpen(b.kind) : run(b.kind))}
            className={`rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${open === b.kind ? "border-accent bg-accent-soft" : "border-border hover:border-accent/50"}`}
          >
            <span className="block text-sm font-semibold">
              {busy === b.kind ? "Working… (up to a minute)" : b.label}
              {results[b.kind] && <span className="ml-1.5 text-xs font-medium text-success">✓ ready</span>}
            </span>
            <span className="block text-xs text-muted">{b.hint}</span>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border p-3">
        <p className="text-sm font-semibold">Sounds like AI?</p>
        <p className="text-xs text-muted">Paste your own draft (cover letter, answer, email) to see which phrases sound generic.</p>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
        <button type="button" disabled={!!busy} onClick={() => run("ai_check")} className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
          {busy === "ai_check" ? "Checking…" : "Check my draft"}
        </button>
      </div>

      {error && <p className="text-sm text-rose">{error}</p>}
      {shown && (
        <div className="rounded-xl bg-chip p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted">Saved {new Date(shown.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
            {shown.kind !== "ai_check" && (
              <button type="button" disabled={!!busy} onClick={() => run(shown.kind)} className="text-xs font-semibold text-accent hover:underline">
                Redo
              </button>
            )}
          </div>
          <Formatted text={shown.content} />
        </div>
      )}
      <p className="text-xs text-muted">Built only from your CV and story bank. It never writes your cover letter or invents experience. Each run is a few pence, saved so you never pay twice.</p>
    </div>
  );
}

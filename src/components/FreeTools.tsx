"use client";

import { useEffect, useMemo, useState } from "react";
import { aiPhraseCheck, bulletNotes, coverLetterPlan, cvBullets, keywordMatch, storyEntries } from "@/lib/cv-coach";
import { embedManyInBrowser } from "@/lib/embed-browser";

type Tab = "keywords" | "stories" | "bullets" | "cover" | "ai";

const TABS: { id: Tab; label: string }[] = [
  { id: "keywords", label: "Keyword match" },
  { id: "stories", label: "Your best stories" },
  { id: "bullets", label: "CV bullets" },
  { id: "cover", label: "Cover letter plan" },
  { id: "ai", label: "Sounds like AI?" },
];

const dot = (a: number[], b: number[]) => a.reduce((n, x, i) => n + x * b[i], 0);

// Ranks texts by how close they are in meaning to the job (free model, runs in the browser).
function useRanked(job: string, texts: string[]): { ranked: string[]; scores: Map<string, number>; loading: boolean } {
  const [scores, setScores] = useState<Map<string, number> | null>(null);
  const key = texts.join("\n");
  useEffect(() => {
    let live = true;
    if (!texts.length || !job) return;
    embedManyInBrowser([job.slice(0, 1500), ...texts]).then((vecs) => {
      if (!live) return;
      if (!vecs) return setScores(new Map());
      const [j, ...rest] = vecs;
      setScores(new Map(texts.map((t, i) => [t, dot(j, rest[i])])));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, key]);
  const ranked = scores?.size ? [...texts].sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0)) : texts;
  return { ranked, scores: scores ?? new Map(), loading: !!texts.length && !!job && scores === null };
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted">{children}</p>;

// Instant, free help for one role: no AI, nothing leaves the browser except what's already saved.
export function FreeTools({ job, company, title, cvText, storyBank }: { job: string; company: string; title: string; cvText: string; storyBank: string }) {
  const [tab, setTab] = useState<Tab>("keywords");
  const [draft, setDraft] = useState("");
  const keywords = useMemo(() => keywordMatch(job, cvText, storyBank), [job, cvText, storyBank]);
  const stories = useMemo(() => storyEntries(storyBank), [storyBank]);
  const bullets = useMemo(() => cvBullets(cvText), [cvText]);
  const rankedStories = useRanked(job, stories);
  const rankedBullets = useRanked(job, bullets);
  const notes = useMemo(() => new Map(bulletNotes(bullets).map((b) => [b.text, b.issues])), [bullets]);
  const missing = keywords.filter((k) => !k.inCv).map((k) => k.term);
  const check = draft.trim() ? aiPhraseCheck(draft) : null;

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === t.id ? "bg-foreground text-background" : "bg-chip text-muted hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3 text-sm leading-6">
        {tab === "keywords" &&
          (!job ? (
            <Empty>This listing has no description to compare against yet.</Empty>
          ) : !keywords.length ? (
            <Empty>No common skills keywords found in this listing.</Empty>
          ) : (
            <>
              {!cvText && <Empty>Upload your CV on your profile to compare it with this role.</Empty>}
              <ul className="mt-1 grid gap-1.5 sm:grid-cols-2">
                {keywords.map((k) => (
                  <li key={k.term} className="flex items-start gap-2">
                    <span className={`mt-0.5 shrink-0 text-xs font-bold ${k.inCv ? "text-success" : k.inStoryBank ? "text-amber" : "text-rose"}`}>{k.inCv ? "✓" : k.inStoryBank ? "◐" : "✗"}</span>
                    <span>
                      {k.term}
                      {!k.inCv && <span className="block text-xs text-muted">{k.inStoryBank ? "In your story bank: add it to your CV" : "Not shown yet"}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">Use the job&apos;s own words for skills you really have, so employers&apos; screening software picks them up.</p>
            </>
          ))}

        {tab === "stories" &&
          (!stories.length ? (
            <Empty>Add notes to your story bank (on My jobs) and your best-matching experiences for this role show here.</Empty>
          ) : (
            <>
              {rankedStories.loading && <p className="text-xs text-muted">Matching your stories to this role…</p>}
              <ol className="space-y-2">
                {rankedStories.ranked.slice(0, 5).map((s, i) => (
                  <li key={s} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted">Lead your CV and answers with the top ones: they&apos;re closest in meaning to this job.</p>
            </>
          ))}

        {tab === "bullets" &&
          (!bullets.length ? (
            <Empty>Upload your CV on your profile to check its bullet points.</Empty>
          ) : (
            <>
              {rankedBullets.loading && <p className="text-xs text-muted">Ranking your bullets for this role…</p>}
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Lead with these for this role</p>
              <ul className="mt-1 space-y-1.5">
                {rankedBullets.ranked.slice(0, 3).map((b) => (
                  <li key={b} className="rounded-lg bg-success-soft px-3 py-2">{b}</li>
                ))}
              </ul>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Bullets to strengthen</p>
              <ul className="mt-1 space-y-2">
                {bullets
                  .filter((b) => notes.get(b)?.length)
                  .slice(0, 8)
                  .map((b) => (
                    <li key={b} className="rounded-lg border border-border px-3 py-2">
                      <span>{b}</span>
                      {notes.get(b)!.map((n) => (
                        <span key={n} className="block text-xs text-amber">
                          {n}
                        </span>
                      ))}
                    </li>
                  ))}
              </ul>
            </>
          ))}

        {tab === "cover" && (
          <div className="space-y-3">
            {coverLetterPlan(company, title, rankedStories.ranked, missing).map((p) => (
              <div key={p.heading}>
                <p className="font-semibold">{p.heading}</p>
                <ul className="mt-1 space-y-1 text-foreground/85">
                  {p.points.map((pt) => (
                    <li key={pt} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="text-xs text-muted">A plan, not a letter: write it in your own words.</p>
          </div>
        )}

        {tab === "ai" && (
          <div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={5}
              placeholder="Paste your own draft: cover letter, application answer or email"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            {check && (
              <div className="mt-2">
                <p className="font-semibold">
                  Sounds like AI: <span className={check.level === "High" ? "text-rose" : check.level === "Medium" ? "text-amber" : "text-success"}>{check.level}</span>
                </p>
                {check.longSentences > 0 && <p className="text-xs text-muted">{check.longSentences} very long sentence{check.longSentences === 1 ? "" : "s"}: split them up.</p>}
                <ul className="mt-1 space-y-1">
                  {check.hits.map((h) => (
                    <li key={h.phrase}>
                      <span className="rounded bg-amber-soft px-1 font-medium text-amber">{h.phrase}</span> → {h.tip}
                    </li>
                  ))}
                </ul>
                {!check.hits.length && !check.longSentences && <p className="text-sm text-success">Reads naturally. Nothing generic spotted.</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

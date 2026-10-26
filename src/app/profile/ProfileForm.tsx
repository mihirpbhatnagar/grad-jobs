"use client";

import { useState, useTransition } from "react";
import { CITIES, DONT_SHOW, FIELDS, SALARY_OPTIONS, type ProfileAnswers } from "@/lib/profile";
import { saveProfile } from "./actions";

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted">
      Use in For you
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`relative h-6 w-10 rounded-full transition-colors ${on ? "bg-accent" : "bg-border"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

function Question({ title, hint, forYou, onForYou, children }: {
  title: string;
  hint?: string;
  forYou?: boolean;
  onForYou?: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold tracking-tight">{title}</h2>
          {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
        </div>
        {onForYou && <Switch on={!!forYou} onChange={onForYou} />}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
        on ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-foreground/30"
      }`}
    >
      {children}
    </button>
  );
}

export function ProfileForm({ initialName, initial, email, cvSlot }: { initialName: string; initial: ProfileAnswers; email: string; cvSlot: React.ReactNode }) {
  const [name, setName] = useState(initialName);
  const [a, setA] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, start] = useTransition();
  const set = <K extends keyof ProfileAnswers>(key: K, value: Partial<ProfileAnswers[K]>) =>
    setA((prev) => ({ ...prev, [key]: { ...prev[key], ...value } }));
  const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const save = () =>
    start(async () => {
      const res = await saveProfile(name, a);
      setStatus(res.ok ? "saved" : "error");
    });

  return (
    <div className="space-y-4">
      <Question title="Your name" hint={`Signed in as ${email}`}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mihir"
          className="w-full max-w-sm rounded-xl border border-border bg-background px-4 py-2.5 outline-none focus:border-foreground/40"
        />
      </Question>

      <Question title="CV" hint="PDF or Word, up to 5 MB. Private to you.">
        {cvSlot}
      </Question>

      <Question title="What roles are you looking for?" forYou={a.fields.forYou} onForYou={(v) => set("fields", { forYou: v })}>
        <div className="flex flex-wrap gap-2">
          {FIELDS.map((f) => (
            <Pill key={f.id} on={a.fields.value.includes(f.id)} onClick={() => set("fields", { value: toggle(a.fields.value, f.id) })}>
              {f.label}
            </Pill>
          ))}
        </div>
      </Question>

      <Question
        title="What do you want from your first role?"
        hint="In your own words, e.g. “lets me express my creativity in design”."
        forYou={a.goals.forYou}
        onForYou={(v) => set("goals", { forYou: v })}
      >
        <textarea
          value={a.goals.value}
          onChange={(e) => set("goals", { value: e.target.value })}
          rows={3}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 outline-none focus:border-foreground/40"
        />
      </Question>

      <Question title="Prioritise visa sponsors" forYou={a.sponsors.forYou} onForYou={(v) => set("sponsors", { forYou: v })}>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={a.sponsors.value} onChange={(e) => set("sponsors", { value: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
          Rank licensed sponsors higher
        </label>
      </Question>

      <Question title="Preferred locations" hint="Ticked places rank higher; nothing is removed." forYou={a.locations.forYou} onForYou={(v) => set("locations", { forYou: v })}>
        <div className="flex flex-wrap gap-2">
          {CITIES.map((c) => (
            <Pill key={c} on={a.locations.value.includes(c)} onClick={() => set("locations", { value: toggle(a.locations.value, c) })}>
              {c}
            </Pill>
          ))}
        </div>
        <input
          value={a.locations.other}
          onChange={(e) => set("locations", { other: e.target.value })}
          placeholder="Other places, separated by commas"
          className="mt-3 w-full max-w-md rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-foreground/40"
        />
      </Question>

      <Question title="Desired salary" hint="Roles with no salary stated stay visible." forYou={a.salary.forYou} onForYou={(v) => set("salary", { forYou: v })}>
        <div className="flex flex-wrap gap-2">
          {SALARY_OPTIONS.map((o) => (
            <Pill key={o.value} on={a.salary.value === o.value} onClick={() => set("salary", { value: o.value })}>
              {o.label}
            </Pill>
          ))}
        </div>
      </Question>

      <Question title="Don't show in For you" hint="Roles that don't state the detail stay visible.">
        <div className="grid gap-2 sm:grid-cols-2">
          {DONT_SHOW.map((o) => (
            <label key={o.id} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm">
              <input
                type="checkbox"
                checked={a.dontShow[o.id]}
                onChange={(e) => setA((prev) => ({ ...prev, dontShow: { ...prev.dontShow, [o.id]: e.target.checked } }))}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              {o.label}
            </label>
          ))}
        </div>
      </Question>

      <div className="sticky bottom-20 z-10 flex items-center justify-end gap-4 rounded-2xl border border-border bg-surface/95 p-4 backdrop-blur md:bottom-4">
        {status === "saved" && <span className="text-sm text-accent">Saved</span>}
        {status === "error" && <span className="text-sm text-rose">Couldn&apos;t save. Try again.</span>}
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-xl bg-foreground px-6 py-2.5 font-medium text-background hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
      </div>
    </div>
  );
}

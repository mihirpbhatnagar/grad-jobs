"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CITIES, FIELDS, SALARY_OPTIONS } from "@/lib/profile";
import { activeFilterCount, filtersToQuery, type RoleFilters } from "@/lib/roles";

const START_OPTIONS: { value: RoleFilters["start"]; label: string }[] = [
  { value: "", label: "Any 2027 start" },
  { value: "summer", label: "June–August 2027" },
  { value: "sept", label: "September 2027" },
  { value: "later", label: "October 2027 or later" },
];

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? "border-accent bg-accent text-white" : "border-border bg-surface text-foreground/80 hover:border-accent/50"}`}
    >
      {children}
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>
      <div className="mt-2.5 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

// Type-to-search field picker: "audit" finds Finance and accounting, "sport" finds Sports business.
function FieldPicker({ value, onChange, myFields }: { value: string[]; onChange: (v: string[]) => void; myFields: string[] }) {
  const [text, setText] = useState("");
  const t = text.trim().toLowerCase();
  const matches = t
    ? FIELDS.filter((f) => !value.includes(f.id) && (f.label.toLowerCase().includes(t) || f.keywords.some((k) => k.trim().startsWith(t) || t.startsWith(k.trim()))))
    : [];
  const mineOn = myFields.length > 0 && myFields.every((id) => value.includes(id));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-80">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0]) {
                e.preventDefault();
                onChange([...value, matches[0].id]);
                setText("");
              }
            }}
            placeholder="Type a field, e.g. marketing, audit, sport"
            className="w-full rounded-xl border border-border bg-background px-3.5 py-2 text-sm outline-none focus:border-accent"
          />
          {matches.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
              {matches.slice(0, 6).map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange([...value, f.id]);
                      setText("");
                    }}
                    className="block w-full px-3.5 py-2 text-left text-sm hover:bg-accent-soft"
                  >
                    {f.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {t && matches.length === 0 && <p className="mt-1 text-xs text-muted">No field matches. Try the search bar for any word.</p>}
        </div>
        {myFields.length > 0 && (
          <Pill on={mineOn} onClick={() => onChange(mineOn ? value.filter((id) => !myFields.includes(id)) : [...new Set([...value, ...myFields])])}>
            ✦ My fields
          </Pill>
        )}
      </div>
      {value.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {value.map((id) => (
            <button key={id} type="button" onClick={() => onChange(value.filter((x) => x !== id))} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm text-white">
              {FIELDS.find((f) => f.id === id)?.label ?? id}
              <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

// Search box with a Filters button (all filters in one panel) and the sort menu.
// Filters are chosen in the panel and applied together; the address keeps them shareable.
export function FilterBar({ filters, path = "/", showStart = true, myFields = [] }: { filters: RoleFilters; path?: string; showStart?: boolean; myFields?: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const [q, setQ] = useState(filters.q);
  const go = (next: RoleFilters) => start(() => router.push(filtersToQuery(next, {}, path), { scroll: false }));
  const set = (changes: Partial<RoleFilters>) => setDraft((d) => ({ ...d, ...changes }));
  const count = activeFilterCount(filters);
  const cleared: Partial<RoleFilters> = { sectors: [], locs: [], salary: 0, start: "", source: "", sponsor: "", schemes: false, closingSoon: false };

  // Removable chips for the filters currently applied.
  const applied: { label: string; remove: Partial<RoleFilters> }[] = [
    ...filters.sectors.map((id) => ({ label: FIELDS.find((f) => f.id === id)?.label ?? id, remove: { sectors: filters.sectors.filter((x) => x !== id) } })),
    ...filters.locs.map((l) => ({ label: l, remove: { locs: filters.locs.filter((x) => x !== l) } })),
    ...(filters.salary ? [{ label: SALARY_OPTIONS.find((o) => o.value === filters.salary)?.label ?? `£${filters.salary}+`, remove: { salary: 0 } }] : []),
    ...(filters.start ? [{ label: START_OPTIONS.find((o) => o.value === filters.start)!.label, remove: { start: "" as const } }] : []),
    ...(filters.source ? [{ label: filters.source === "reed" ? "From Reed" : "From Google Jobs", remove: { source: "" as const } }] : []),
  ];

  return (
    <div className={pending ? "opacity-70 transition-opacity" : "transition-opacity"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go({ ...filters, q: q.trim() });
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <label className="flex flex-1 items-center gap-3 rounded-2xl bg-surface px-4 py-3 shadow-lg shadow-black/10 ring-1 ring-border focus-within:ring-2 focus-within:ring-accent">
          <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="9" cy="9" r="6" />
            <path d="m14 14 4 4" strokeLinecap="round" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search job title, company or town"
            className="w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted"
          />
          <button type="submit" className="rounded-xl bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90">
            Search
          </button>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setDraft(filters);
              setOpen((o) => !o);
            }}
            aria-expanded={open}
            className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg shadow-black/10 ring-1 sm:flex-none ${open || count ? "bg-foreground text-background ring-foreground" : "bg-surface text-foreground ring-border hover:ring-accent"}`}
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M3 5h14M6 10h8M8.5 15h3" strokeLinecap="round" />
            </svg>
            Filters
            {count > 0 && <span className="rounded-full bg-accent px-1.5 text-xs text-white">{count}</span>}
          </button>
          <label className="relative flex flex-1 items-center rounded-2xl bg-surface text-sm shadow-lg shadow-black/10 ring-1 ring-border sm:flex-none">
            <span className="sr-only">Sort</span>
            <select
              value={filters.sort}
              onChange={(e) => go({ ...filters, sort: e.target.value as RoleFilters["sort"] })}
              title="Default order: well-known employers and the most complete, clearly-2027 roles first, within your search and filters"
              className="w-full appearance-none bg-transparent py-3 pl-4 pr-9 font-semibold text-foreground outline-none"
            >
              <option value="">Sort by</option>
              <option value="newest">Newest first</option>
              <option value="closing">Closing soonest</option>
            </select>
            <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-3 h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="m6 8 4 4 4-4" strokeLinecap="round" />
            </svg>
          </label>
        </div>
      </form>

      {open && (
        <div className="mt-3 rounded-2xl border border-border bg-surface p-5 text-foreground shadow-xl shadow-black/10">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Field</h3>
              <div className="mt-2.5">
                <FieldPicker value={draft.sectors} onChange={(sectors) => set({ sectors })} myFields={myFields} />
              </div>
            </div>
            <Group title="Location">
              {[...CITIES, "Leeds", "Bristol", "Glasgow", "Nottingham", "Remote", "Abroad"].map((c) => (
                <Pill key={c} on={draft.locs.includes(c)} onClick={() => set({ locs: toggle(draft.locs, c) })}>
                  {c}
                </Pill>
              ))}
            </Group>
            <Group title="Salary">
              {SALARY_OPTIONS.map((o) => (
                <Pill key={o.value} on={draft.salary === o.value} onClick={() => set({ salary: o.value })}>
                  {o.value ? o.label.replace(" (new-entrant visa floor)", " · visa floor") : "Any"}
                </Pill>
              ))}
            </Group>
            {showStart && (
              <Group title="Start date">
                {START_OPTIONS.map((o) => (
                  <Pill key={o.value} on={draft.start === o.value} onClick={() => set({ start: o.value })}>
                    {o.label}
                  </Pill>
                ))}
              </Group>
            )}
            <Group title="Visa sponsorship">
              <Pill on={draft.sponsor === ""} onClick={() => set({ sponsor: "" })}>Any employer</Pill>
              <Pill on={draft.sponsor === "likely"} onClick={() => set({ sponsor: "likely" })}>✓ Licensed sponsors only</Pill>
            </Group>
            <Group title="Role type">
              <Pill on={draft.schemes} onClick={() => set({ schemes: !draft.schemes })}>Graduate schemes</Pill>
              <Pill on={draft.closingSoon} onClick={() => set({ closingSoon: !draft.closingSoon })}>Closing this week</Pill>
            </Group>
            <Group title="Found by">
              <Pill on={draft.source === ""} onClick={() => set({ source: "" })}>All sources</Pill>
              <Pill on={draft.source === "reed"} onClick={() => set({ source: "reed" })}>Reed</Pill>
              <Pill on={draft.source === "google_jobs"} onClick={() => set({ source: "google_jobs" })}>Google Jobs</Pill>
            </Group>
          </div>
          <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
            <button type="button" onClick={() => set(cleared)} className="px-3 py-2 text-sm font-medium text-muted hover:text-foreground">
              Clear all
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                go({ ...draft, q: q.trim() });
              }}
              className="rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Show roles
            </button>
          </div>
        </div>
      )}

      {!open && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(
            [
              ["✓ Licensed sponsors only", filters.sponsor === "likely", { sponsor: filters.sponsor === "likely" ? "" : "likely" }],
              ...(showStart ? [["Graduate schemes", filters.schemes, { schemes: !filters.schemes }]] : []),
              ["Closing this week", filters.closingSoon, { closingSoon: !filters.closingSoon, sort: filters.closingSoon ? filters.sort : "closing" }],
              ...(myFields.length
                ? [["✦ My fields", myFields.every((id) => filters.sectors.includes(id)), { sectors: myFields.every((id) => filters.sectors.includes(id)) ? filters.sectors.filter((id) => !myFields.includes(id)) : [...new Set([...filters.sectors, ...myFields])] }]]
                : []),
            ] as [string, boolean, Partial<RoleFilters>][]
          ).map(([label, on, change]) => (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              onClick={() => go({ ...filters, ...change })}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${on ? "bg-white text-accent shadow" : "bg-white/10 text-white ring-1 ring-white/30 hover:bg-white/20"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {applied.length > 0 && !open && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {applied.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => go({ ...filters, ...a.remove })}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/25 hover:bg-white/25"
            >
              {a.label}
              <span aria-hidden>×</span>
            </button>
          ))}
          <button type="button" onClick={() => go({ ...filters, ...cleared })} className="text-xs font-medium text-white/80 underline-offset-2 hover:underline">
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

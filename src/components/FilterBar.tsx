"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CITIES, FIELDS, SALARY_OPTIONS } from "@/lib/profile";
import { filtersToQuery, type RoleFilters } from "@/lib/roles";

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className={`relative flex items-center rounded-xl border bg-surface text-sm transition-colors ${value ? "border-foreground" : "border-border hover:border-foreground/30"}`}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="appearance-none bg-transparent py-2 pl-3.5 pr-8 outline-none">
        {children}
      </select>
      <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-2.5 h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="m6 8 4 4 4-4" strokeLinecap="round" />
      </svg>
    </label>
  );
}

// Dropdown filters for All roles; each change updates the address so results are shareable.
export function FilterBar({ filters }: { filters: RoleFilters }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (changes: Partial<RoleFilters>) => start(() => router.push(filtersToQuery(filters, changes), { scroll: false }));
  const active =
    filters.sectors.length + filters.locs.length + (filters.salary ? 1 : 0) + (filters.start ? 1 : 0) + (filters.source ? 1 : 0) + (filters.sponsor ? 1 : 0) + (filters.schemes ? 1 : 0) + (filters.closingSoon ? 1 : 0);

  return (
    <div className={`mt-4 flex flex-wrap items-center gap-2 transition-opacity ${pending ? "opacity-60" : ""}`}>
      <Select label="Sector" value={filters.sectors.length === 1 ? filters.sectors[0] : filters.sectors.length ? "multi" : ""} onChange={(v) => go({ sectors: v && v !== "multi" ? [v] : [] })}>
        <option value="">All sectors</option>
        {filters.sectors.length > 1 && <option value="multi">{filters.sectors.length} sectors</option>}
        {FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
      </Select>
      <Select label="Location" value={filters.locs.length === 1 ? filters.locs[0] : filters.locs.length ? "multi" : ""} onChange={(v) => go({ locs: v && v !== "multi" ? [v] : [] })}>
        <option value="">Anywhere in the UK</option>
        {filters.locs.length > 1 && <option value="multi">{filters.locs.length} places</option>}
        {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </Select>
      <Select label="Salary" value={String(filters.salary || "")} onChange={(v) => go({ salary: Number(v) || 0 })}>
        {SALARY_OPTIONS.map((o) => <option key={o.value} value={o.value || ""}>{o.value ? o.label : "Any salary"}</option>)}
      </Select>
      <Select label="Start date" value={filters.start} onChange={(v) => go({ start: v as RoleFilters["start"] })}>
        <option value="">Any 2027 start</option>
        <option value="summer">June–August 2027</option>
        <option value="sept">September 2027</option>
        <option value="later">October 2027 or later</option>
        <option value="unstated">Start date not stated</option>
      </Select>
      <Select label="Sponsor" value={filters.sponsor} onChange={(v) => go({ sponsor: v as RoleFilters["sponsor"] })}>
        <option value="">Any employer</option>
        <option value="likely">Licensed sponsors</option>
        <option value="unclear">Sponsor unclear</option>
        <option value="not_listed">Not on register</option>
      </Select>
      <Select label="Source" value={filters.source} onChange={(v) => go({ source: v as RoleFilters["source"] })}>
        <option value="">All sources</option>
        <option value="reed">Reed</option>
        <option value="google_jobs">Google Jobs</option>
      </Select>
      <button
        type="button"
        onClick={() => go({ schemes: !filters.schemes })}
        className={`rounded-xl border px-3.5 py-2 text-sm ${filters.schemes ? "border-foreground bg-foreground text-background" : "border-border bg-surface hover:border-foreground/30"}`}
      >
        Graduate schemes
      </button>
      <button
        type="button"
        onClick={() => go({ closingSoon: !filters.closingSoon })}
        className={`rounded-xl border px-3.5 py-2 text-sm ${filters.closingSoon ? "border-foreground bg-foreground text-background" : "border-border bg-surface hover:border-foreground/30"}`}
      >
        Closing in 2 weeks
      </button>
      <Select label="Sort" value={filters.sort} onChange={(v) => go({ sort: v as RoleFilters["sort"] })}>
        <option value="newest">Newest first</option>
        <option value="closing">Closing soonest</option>
      </Select>
      {active > 0 && (
        <button
          type="button"
          onClick={() => go({ sectors: [], locs: [], salary: 0, start: "", source: "", sponsor: "", schemes: false, closingSoon: false })}
          className="px-2 py-2 text-sm text-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

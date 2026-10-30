// Small display helpers shared by role cards and role pages.

const gbpShort = (n: number) => (n >= 1000 ? `£${Math.round(n / 1000)}k` : `£${n}`);

export function salaryShort(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  if (min && max && max !== min) return `${gbpShort(min)}–${gbpShort(max)}`;
  return gbpShort((min ?? max)!);
}

// A listing that gives no figure but says "competitive salary".
export const isCompetitive = (salaryText: string | null | undefined, tags: { salaryCompetitive?: boolean }) =>
  !!tags.salaryCompetitive || /competitive/i.test(salaryText ?? "");

export const money = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

export const dateLong = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
export const dateShort = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// Whole days from today to a date, both as UK calendar dates (0 = today), so the countdown
// agrees with the database's date filters at any time of night.
export function daysUntil(iso: string): number {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  return Math.round((Date.parse(iso.slice(0, 10)) - Date.parse(today)) / 86_400_000);
}

// Today's date in the UK, for database filters ("2026-10-28"), and the date a week ahead.
export const ukToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
export const weekAhead = () => new Date(Date.parse(ukToday()) + 7 * 86_400_000).toISOString().slice(0, 10);

export function postedAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 30) return `Posted ${days} days ago`;
  return `Posted ${dateShort(iso)}`;
}

export function startLabel(role: { start_status: string | null; tags: { startText: string | null } }): string {
  if (role.start_status === "confirmed" && role.tags.startText) return `Starts ${role.tags.startText}`;
  if (role.start_status === "likely") return "Exact start date not mentioned";
  return "Start not stated";
}

// Older listings were stored with some HTML codes (e.g. "&#163;" for £) still in the text.
export const decodeEntities = (text: string) =>
  text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&pound;/g, "£")
    .replace(/&amp;/g, "&");

// "Glasgow (G84 8HL)" -> "Glasgow": postcodes in brackets add nothing on a card.
export const placeName = (location: string | null | undefined) =>
  location ? location.replace(/\s*\(?\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b\)?/g, "").replace(/\s*,\s*$/, "").trim() || location : null;

// Job boards sometimes appear as the "employer" (Google Jobs lists the board that posted it).
const BOARDS = /^(targetjobs|efinancialcareers|graduate talent|brighterbox|bright network|gradcracker|milkround|prospects|ratemyplacement|trackr|jobteaser|higherin|inspiring interns|give a grad a go|grb|graduate recruitment bureau|jobleads|jooble|totaljobs|cv-library|indeed|linkedin|glassdoor)\b/i;
export function isBoardName(employer: string): boolean {
  return BOARDS.test(employer.trim());
}

// What to show as the employer: a job board's name is replaced, since it isn't the employer.
export const employerLabel = (employer: string) => (isBoardName(employer) ? `Employer not named · via ${employer}` : employer);

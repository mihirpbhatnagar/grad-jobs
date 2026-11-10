import { publicClient } from "./supabase";

// Visa fit for users on the 18-month Graduate visa (from the assumed approval date).
// All thresholds come from the editable settings table, never hard-coded here.

export type VisaSettings = { newEntrantSalary: number; graduateMonths: number; approvalDate: string };

export async function visaSettings(): Promise<VisaSettings> {
  const db = publicClient();
  const { data } = db ? await db.from("settings").select("key,value").like("key", "visa.%") : { data: [] };
  const get = (key: string) => data?.find((r) => r.key === key)?.value;
  return {
    newEntrantSalary: Number(get("visa.new_entrant_salary_gbp") ?? 33400),
    graduateMonths: Number(get("visa.graduate_route_months") ?? 18),
    approvalDate: String(get("visa.assumed_approval_date") ?? "2027-07-01"),
  };
}

export type VisaFit = { level: "fits" | "switch" | "ask"; label: string; detail: string };

type RoleForVisa = {
  contract_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  sponsor_status: "likely" | "unclear" | "not_listed" | null;
  tags: { lengthMonths: number | null; startDate?: string | null; startText?: string | null };
};

// Month arithmetic that stays inside the month: 31 October + 18 months is 30 April, not 1 May.
export function addMonths(iso: string, months: number): Date {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

// For the flag on role cards: the listing states a length, and the role would still be running
// when the Graduate visa ends. Such roles are flagged, never hidden. (Starting before the visa
// does is fine; only the end date matters.)
export function runsPastVisa(role: { tags: StartTags & { lengthMonths: number | null } }, s: VisaSettings): boolean {
  if (!role.tags.lengthMonths) return false;
  return addMonths(schemeStart(role.tags, s), role.tags.lengthMonths) > addMonths(s.approvalDate, s.graduateMonths);
}

// When the role starts, for working out when it ends. A listing that names only the year
// ("2027 Graduate Programme") is stored as 1 January of that year; graduate intakes start in the
// autumn, so September is used, as it is when no start is stated at all. Assuming January made
// two-year schemes look as if they ended before the visa does.
type StartTags = { startDate?: string | null; startText?: string | null };
export function schemeStart(tags: StartTags, s: VisaSettings): string {
  const yearOnly = /^\d{4}$/.test(tags.startText ?? "") || (!!tags.startDate && !tags.startText);
  if (tags.startDate && !yearOnly) return tags.startDate;
  return `${tags.startDate ? tags.startDate.slice(0, 4) : s.approvalDate.slice(0, 4)}-09-01`;
}
export const visaEndsLabel = (s: VisaSettings) =>
  addMonths(s.approvalDate, s.graduateMonths).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export function visaFit(role: RoleForVisa, s: VisaSettings): VisaFit {
  const visaEnds = addMonths(s.approvalDate, s.graduateMonths);
  const visaEndLabel = visaEnds.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const start = schemeStart(role.tags, s);
  const fixedTerm = /contract|temp|fixed/i.test(role.contract_type ?? "");

  // A fixed-length scheme or contract that ends before the Graduate visa does.
  if (role.tags.lengthMonths && (fixedTerm || role.contract_type == null) && addMonths(start, role.tags.lengthMonths) <= visaEnds) {
    return { level: "fits", label: "Fits easily", detail: `The scheme ends before your Graduate visa does (${visaEndLabel}), so it needs no sponsorship. Staying on afterwards would.` };
  }

  const pay = Math.max(role.salary_min ?? 0, role.salary_max ?? 0);
  const meetsSalary = pay >= s.newEntrantSalary;
  const floor = `£${s.newEntrantSalary.toLocaleString("en-GB")}`;
  if (role.sponsor_status === "likely" && meetsSalary) {
    return {
      level: "switch",
      label: "Switch possible",
      detail: `Runs past your Graduate visa (${visaEndLabel}), but they're a licensed sponsor and the salary meets the ${floor} new-entrant level, so a Skilled Worker switch is possible.`,
    };
  }
  // Only licensed sponsors are named; not being on the register isn't called out.
  const salaryNote = role.sponsor_status === "likely" && !meetsSalary ? ` The salary ${pay ? `is below ${floor}` : "isn't stated"}, which a Skilled Worker switch needs.` : "";
  return {
    level: "ask",
    label: "Ask early",
    detail: `Likely runs past your Graduate visa (${visaEndLabel}).${salaryNote} Ask about sponsorship before you're far into the process.`,
  };
}

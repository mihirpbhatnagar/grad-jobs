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
  tags: { lengthMonths: number | null; startDate?: string | null };
};

function addMonths(iso: string, months: number): Date {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function visaFit(role: RoleForVisa, s: VisaSettings): VisaFit {
  const visaEnds = addMonths(s.approvalDate, s.graduateMonths);
  const visaEndLabel = visaEnds.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const start = role.tags.startDate ?? s.approvalDate;
  const fixedTerm = /contract|temp|fixed/i.test(role.contract_type ?? "");

  // A fixed-length scheme or contract that ends before the Graduate visa does.
  if (role.tags.lengthMonths && (fixedTerm || role.contract_type == null) && addMonths(start, role.tags.lengthMonths) <= visaEnds) {
    return { level: "fits", label: "Fits easily", detail: `The role ends before your Graduate visa does (${visaEndLabel}). No sponsorship needed.` };
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

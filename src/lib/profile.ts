// Profile answers. Each answer has a "Use in For you" switch: on = it shapes For you,
// off = it's saved and available as a filter in All roles.

export const FIELDS: { id: string; label: string; keywords: string[] }[] = [
  { id: "sports", label: "Sports business and partnerships", keywords: ["sport", "sports", "partnership", "sponsorship", "athlete", "club", "fitness", "football", "rugby", "cricket"] },
  { id: "marketing", label: "Marketing and brand", keywords: ["marketing", "brand", "digital marketing", "social media", "content", "campaign", "seo", "advertising", "creative"] },
  { id: "sales", label: "Sales and business development", keywords: ["sales", "business development", "account manager", "account executive", "commercial", "partnerships", "client"] },
  { id: "consulting", label: "Consulting", keywords: ["consulting", "consultant", "advisory", "strategy"] },
  { id: "finance", label: "Finance and accounting", keywords: ["finance", "accounting", "accountant", "audit", "tax", "aca", "acca", "cima", "financial"] },
  { id: "banking", label: "Banking and investment", keywords: ["banking", "investment", "markets", "trading", "asset management", "wealth", "corporate banking"] },
  { id: "operations", label: "Operations and supply chain", keywords: ["operations", "supply chain", "logistics", "procurement", "purchasing"] },
  { id: "project", label: "Project management", keywords: ["project manager", "project management", "project coordinator", "programme management", "pmo"] },
  { id: "hr", label: "HR and people", keywords: ["hr", "human resources", "people", "talent", "recruitment", "recruiter"] },
  { id: "data", label: "Data and analytics", keywords: ["data", "analytics", "analyst", "insight", "sql", "business intelligence"] },
  { id: "technology", label: "Technology", keywords: ["software", "developer", "engineer", "technology", "it ", "cyber", "cloud", "technical"] },
  { id: "media", label: "Media, communications and PR", keywords: ["media", "communications", "pr ", "public relations", "journalism", "press"] },
  { id: "events", label: "Events and hospitality", keywords: ["events", "event", "hospitality", "hotel", "venue"] },
  { id: "retail", label: "Retail and FMCG commercial", keywords: ["retail", "fmcg", "buying", "merchandising", "category", "consumer"] },
  { id: "public", label: "Public sector and policy", keywords: ["policy", "civil service", "government", "public sector", "council", "nhs"] },
];

export const CITIES = ["London", "Manchester", "Birmingham", "Edinburgh"];

export const SALARY_OPTIONS = [
  { value: 0, label: "Any" },
  { value: 24000, label: "£24k+" },
  { value: 28000, label: "£28k+" },
  { value: 30000, label: "£30k+" },
  { value: 33400, label: "£33.4k+ (new-entrant visa floor)" },
  { value: 35000, label: "£35k+" },
  { value: 40000, label: "£40k+" },
  { value: 45000, label: "£45k+" },
];

export const DONT_SHOW = [
  { id: "nonSponsors", label: "Companies not on the sponsor register" },
  { id: "drivingLicence", label: "Roles needing a driving licence" },
  { id: "longSchemes", label: "Schemes longer than 18 months" },
  { id: "beforeJune", label: "Starting before June 2027" },
  { id: "afterSept", label: "Starting after September 2027" },
  { id: "otherLocations", label: "Locations I haven't ticked" },
] as const;

export type DontShowId = (typeof DONT_SHOW)[number]["id"];

export type ProfileAnswers = {
  fields: { value: string[]; forYou: boolean };
  goals: { value: string; forYou: boolean };
  sponsors: { value: boolean; forYou: boolean };
  locations: { value: string[]; other: string; forYou: boolean };
  salary: { value: number; forYou: boolean };
  dontShow: Record<DontShowId, boolean>;
};

export const DEFAULT_ANSWERS: ProfileAnswers = {
  fields: { value: [], forYou: true },
  goals: { value: "", forYou: true },
  sponsors: { value: true, forYou: false },
  locations: { value: [], other: "", forYou: false },
  salary: { value: 0, forYou: false },
  dontShow: { nonSponsors: false, drivingLicence: false, longSchemes: false, beforeJune: false, afterSept: false, otherLocations: false },
};

// Fills in any answers a stored profile is missing (e.g. questions added later).
export function withDefaults(stored: Partial<ProfileAnswers> | null | undefined): ProfileAnswers {
  const s = stored ?? {};
  return {
    fields: { ...DEFAULT_ANSWERS.fields, ...s.fields },
    goals: { ...DEFAULT_ANSWERS.goals, ...s.goals },
    sponsors: { ...DEFAULT_ANSWERS.sponsors, ...s.sponsors },
    locations: { ...DEFAULT_ANSWERS.locations, ...s.locations },
    salary: { ...DEFAULT_ANSWERS.salary, ...s.salary },
    dontShow: { ...DEFAULT_ANSWERS.dontShow, ...s.dontShow },
  };
}

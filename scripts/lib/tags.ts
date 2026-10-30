// Free text rules (no AI) that read a listing and pull out the facts users filter on.
// Anything a listing doesn't mention stays null, so the UI can show "not stated".

import { isBoardName } from "../../src/lib/format.ts";

export { isBoardName };

export type RoleTags = {
  degree: "First" | "2:1" | "2:2" | null;
  sponsorship: "not_offered" | "offered" | null;
  stages: string[];
  drivingLicence: boolean;
  startText: string | null;
  startDate: string | null;
  deadline: string | null;
  lengthMonths: number | null;
  graduateScheme: boolean;
  programmeTitle: boolean;
  // A graduate job title ("Graduate Accountant", "Finance Graduate"), not "...ideal for graduates".
  graduateTitle: boolean;
  // Temp / immediate jobs ("temporary", "interviewing now"): they start now, not in 2027.
  tempTitle: boolean;
  salaryCompetitive: boolean;
  // Country for roles outside the UK (null = UK). Every user needs sponsorship abroad.
  abroad: string | null;
  immediateStart: boolean;
  aimedAt2027: boolean;
};

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
// Full names first so "september" wins over "sep"; abbreviations catch titles like "(Sept 2027)".
const MONTH_RE = [...MONTHS, "sept", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].join("|");
const SEASON_MONTH: Record<string, number> = { spring: 3, summer: 6, autumn: 9, winter: 12 };
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eighteen: 18, twelve: 12, "twenty-four": 24,
};

const NO_SPONSORSHIP = [
  /\bmust (already )?(have|hold) (the )?(legal )?(right|authori[sz]ation|eligibility) to work in (the )?(us|usa|united states|eu|germany|france|netherlands|ireland|canada|australia|singapore|uae|india|switzerland)\b/i,
  /\b(authori[sz]ed|eligible) to work in the (us|united states)\b[^.]{0,40}\bwithout\b/i,
  /\b(unable|not able|cannot|can ?not|can't|do not|don't|will not|won't|not in a position)\s+(to\s+)?(offer|provide|support|consider)?\s*(any\s+)?(visa\s+)?sponsor/i,
  /\bno\s+(visa\s+)?sponsorship\b/i,
  /\bsponsorship\s+(is\s+)?(not|unavailable)\b/i,
  /\bwithout\s+(the\s+need\s+for\s+)?(visa\s+)?sponsorship\b/i,
  /\bdoes\s+not\s+offer\s+(visa\s+)?sponsorship\b/i,
];
const OFFERS_SPONSORSHIP = [
  /\b(visa|work permit|relocation)\s+(support|assistance|package|sponsorship)\s+(is\s+)?(available|provided|offered|included)\b/i,
  /\b(we|will)\s+(provide|offer|support)\s+(visa|work permit|relocation)\b/i,
  /\b(visa\s+)?sponsorship\s+(is\s+)?(available|offered|provided|possible)\b/i,
  /\bwe\s+(can|will|are able to)\s+(offer\s+|provide\s+)?(visa\s+)?sponsor/i,
  /\bopen to (candidates|applicants) (requiring|who require|needing) (visa )?sponsorship\b/i,
];

const STAGES: [string, RegExp][] = [
  ["Online tests", /\b(online|psychometric|numerical|verbal|logical|situational judge?ment|aptitude)\s+(test|assessment|reasoning)s?\b/i],
  ["Video interview", /\b(video|recorded|digital|hirevue|on-?demand)\s+interview/i],
  ["Assessment centre", /\bassessment\s+(centre|center|day)s?\b/i],
  ["Case study", /\bcase\s+stud(y|ies)\b/i],
  ["Interview", /\b(final|face[- ]to[- ]face|in[- ]person|panel|telephone|phone)\s+interview/i],
];

function parseMonthYear(month: string, year: string): string {
  const key = month.toLowerCase();
  const m = MONTHS.findIndex((full) => full.startsWith(key.slice(0, 3))) + 1 || SEASON_MONTH[key] || 1;
  return `${year}-${String(m).padStart(2, "0")}-01`;
}

function findStart(text: string): { startText: string | null; startDate: string | null } {
  const patterns = [
    new RegExp(`\\b(${MONTH_RE}|spring|summer|autumn|winter)\\s+(202[6-9])\\s+(start|intake|cohort|entry)`, "i"),
    new RegExp(`\\((${MONTH_RE})\\s+(202[6-9])(?:\\s+(?:start|intake))?\\)`, "i"),
    new RegExp(`\\b(?:start(?:ing|s)?|commenc\\w*|join(?:ing)?|intake)\\b[^.\\n]{0,40}?\\b(${MONTH_RE}|spring|summer|autumn|winter)\\s+(202[6-9])`, "i"),
    /\b(202[6-9])\s+(?:graduate\s+)?(?:intake|start|cohort|programme|scheme)\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    if (m.length === 2 || /^\d{4}$/.test(m[1])) {
      return { startText: m[1], startDate: `${m[1]}-01-01` };
    }
    const label = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    return { startText: `${label} ${m[2]}`, startDate: parseMonthYear(m[1], m[2]) };
  }
  return { startText: null, startDate: null };
}

// "Salary: £34,000 per annum + £2,000 welcome bonus" -> 34,000. Yearly amounts only, from a
// line that talks about salary or pay (bonuses, allowances and hourly rates are ignored).
export function findSalary(text: string): { min: number; max: number } | null {
  const toNumber = (amount: string, k: string | undefined) => {
    const n = Number(amount.replace(/,/g, ""));
    return k ? n * 1000 : n;
  };
  for (const raw of text.split(/\n|(?<=\.)\s+/)) {
    const line = raw.replace(/\s+/g, " ");
    if (!/£/.test(line) || /\b(per hour|an hour|p\/h|hourly|per day|a day|daily rate)\b/i.test(line)) continue;
    if (!/\b(salary|salaries|pay|per annum|p\.?a\.?|a year|per year|annual|starting|package|£\d{2}k)\b/i.test(line)) continue;
    const amounts: number[] = [];
    for (const m of line.matchAll(/£\s?(\d{1,3}(?:,\d{3})+|\d{2,3}(?:\.\d)?)\s?(k|K)?\b(?![^.]{0,25}\b(bonus|allowance|relocation|sign[- ]?on|golden hello|signing)\b)/g)) {
      if (/\b(bonus|allowance|relocation|sign[- ]?on|golden hello|signing)\b[^£]{0,8}$/i.test(line.slice(0, m.index))) continue;
      const n = toNumber(m[1], m[2]);
      if (n >= 16000 && n <= 120000) amounts.push(n);
    }
    if (amounts.length) return { min: Math.min(...amounts.slice(0, 2)), max: Math.max(...amounts.slice(0, 2)) };
  }
  return null;
}

function findDeadline(text: string): string | null {
  const re = new RegExp(
    `\\b(?:closing date|deadline|applications? close|close[sd]? on|apply by|applications? (?:must be|should be) (?:received|submitted) by)\\b[^.]{0,30}?\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\s*,?\\s*(202[6-9])?`,
    "i",
  );
  const m = text.match(re);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
  const year = m[3] ?? String(new Date().getFullYear() + (month < new Date().getMonth() + 1 ? 1 : 0));
  return `${year}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function findLengthMonths(text: string): number | null {
  const re = /\b(\d{1,2}|one|two|three|four|five|six|twelve|eighteen|twenty-four)[- ](year|month)s?(?:[- ]long)?\s+(?:graduate\s+|rotational\s+|training\s+|development\s+)*(programme|program|scheme|rotation|contract|fixed[- ]term|placement|apprenticeship)/i;
  const m = text.match(re);
  if (!m) return null;
  const n = Number(m[1]) || NUMBER_WORDS[m[1].toLowerCase()];
  if (!n) return null;
  return m[2].toLowerCase() === "year" ? n * 12 : n;
}

// Scope rule: does this listing read as a graduate / early-career role at all? Reed's own
// graduate flag also returns senior roles, so every listing passes through this first.
const SENIOR_TITLE = /\b(senior|snr|sr|principal|head of|director|vp|chief|partner)\b|\b(team|tech|technical|project|engineering|design|mechanical|electrical|site|shift)\s+lead\b/i;
const EARLY_TITLE = /\b(graduate|grad|trainee|junior|entry[- ]level|early careers?|apprentice|intern|internship|placement|assistant|associate|analyst|coordinator|executive|administrator|advisor|adviser)\b/i;
const EARLY_TEXT = /\b(graduates?|grad (scheme|programme)|entry[- ]level|trainee|recent(ly)? graduated?|final[- ]year (students?|undergraduates?)|no (prior |previous )?experience (is )?(required|needed|necessary)|full training (is )?(given|provided)|early careers?|first (step|role) in your career|class of 2027|2027 (start|intake|cohort|graduates?))\b/i;
const GRAD_IN_TITLE = /\b(graduate|grad|trainee|junior|entry[- ]level|early careers?|intern|internship|work experience)\b/i;

export function isSeniorTitle(title: string): boolean {
  // "Manager" / "Lead" on their own are experienced roles ("Marketing Lead", "Sales Manager");
  // with a graduate word they aren't ("Graduate Trainee Manager").
  return (SENIOR_TITLE.test(title) || /\b(manager|lead)\b/i.test(title)) && !GRAD_IN_TITLE.test(title);
}

// Roles outside the UK that slip in through broad searches (e.g. "On site, Berlin").
const ABROAD = /\b(germany|berlin|munich|frankfurt|hamburg|france|paris|lyon|spain|madrid|barcelona|netherlands|amsterdam|rotterdam|republic of ireland|dublin|cork|galway|usa|u\.s\.|united states|new york|california|texas|chicago|boston|pennsylvania|villanova|canada|toronto|india|bangalore|bengaluru|mumbai|singapore|australia|sydney|melbourne|dubai|uae|hong kong|switzerland|zurich|geneva|sweden|stockholm|denmark|copenhagen|norway|oslo|poland|warsaw|krakow|italy|milan|rome|belgium|brussels|portugal|lisbon|austria|vienna|czech|prague|luxembourg|south africa|philippines|china|shanghai|japan|tokyo)\b/i;

const COUNTRY: [RegExp, string][] = [
  [/\b(germany|berlin|munich|frankfurt|hamburg)\b/i, "Germany"], [/\b(france|paris|lyon)\b/i, "France"],
  [/\b(spain|madrid|barcelona)\b/i, "Spain"], [/\b(netherlands|amsterdam|rotterdam)\b/i, "Netherlands"],
  [/\b(republic of ireland|dublin|cork|galway)\b/i, "Ireland"], [/\b(usa|u\.s\.|united states|new york|california|texas|chicago|boston|pennsylvania|villanova)\b/i, "United States"],
  [/\b(canada|toronto)\b/i, "Canada"], [/\b(india|bangalore|bengaluru|mumbai)\b/i, "India"], [/\b(singapore)\b/i, "Singapore"],
  [/\b(australia|sydney|melbourne)\b/i, "Australia"], [/\b(dubai|uae)\b/i, "UAE"], [/\b(hong kong)\b/i, "Hong Kong"],
  [/\b(switzerland|zurich|geneva)\b/i, "Switzerland"], [/\b(sweden|stockholm)\b/i, "Sweden"], [/\b(denmark|copenhagen)\b/i, "Denmark"],
  [/\b(norway|oslo)\b/i, "Norway"], [/\b(poland|warsaw|krakow)\b/i, "Poland"], [/\b(italy|milan|rome)\b/i, "Italy"],
  [/\b(belgium|brussels)\b/i, "Belgium"], [/\b(portugal|lisbon)\b/i, "Portugal"], [/\b(austria|vienna)\b/i, "Austria"],
  [/\b(czech|prague)\b/i, "Czechia"], [/\b(luxembourg)\b/i, "Luxembourg"], [/\b(south africa)\b/i, "South Africa"],
  [/\b(philippines)\b/i, "Philippines"], [/\b(china|shanghai)\b/i, "China"], [/\b(japan|tokyo)\b/i, "Japan"], [/\b(qatar)\b/i, "Qatar"],
];

// The country of a role outside the UK, or null for a UK role.
export function countryOf(title: string, location: string | null): string | null {
  if (!isOutsideUk(title, location)) return null;
  const text = `${location ?? ""} ${title}`;
  return COUNTRY.find(([re]) => re.test(text))?.[1] ?? "Abroad";
}

export function isOutsideUk(title: string, location: string | null): boolean {
  const place = location ?? "";
  if (/\b(uk|united kingdom|england|scotland|wales|northern ireland|london)\b/i.test(place)) return false;
  return ABROAD.test(place) || ABROAD.test(title.replace(/\b(international|global|europe|emea)\b/gi, ""));
}

// Job boards sometimes appear as the "employer" in Google Jobs. The real employer is often at
// the end of the title ("... Programme - Macquarie Group"); otherwise the board name stays.
export function employerFromTitle(title: string): string | null {
  const m = title.match(/\s[-–—|]\s([A-Z][\w&.'’ ]{2,50})$/) ?? title.match(/\sat\s([A-Z][\w&.'’ ]{2,50})$/);
  if (!m) return null;
  const name = m[1].trim();
  // Not a place, programme word or work pattern.
  if (/\b(london|manchester|birmingham|leeds|edinburgh|glasgow|bristol|uk|remote|hybrid|on[- ]?site|graduate|programme|program|scheme|intake|20\d\d|operations|career|leadership|growth|launch)\b/i.test(name)) return null;
  return name;
}

export function isEarlyCareer(title: string, description: string): boolean {
  if (isSeniorTitle(title)) return false;
  if (GRAD_IN_TITLE.test(title)) return true;
  return EARLY_TEXT.test(`${title}\n${description}`) && (EARLY_TITLE.test(title) || /\bgraduates?\b/i.test(description));
}

// Internships, placements and apprenticeships are stored but kept out of the main list.
export function roleKind(title: string): "job" | "internship" | "apprenticeship" {
  if (/\b(intern|interns|internship|internships|placement|work experience|work placement|vacation scheme|insight (day|week|programme)|spring week|summer analyst)\b/i.test(title)) return "internship";
  if (/\bapprentice(ship)?\b/i.test(title)) return "apprenticeship";
  return "job";
}

// When does the role start, relative to the earliest start users can take (June 2027)?
//   confirmed: the listing states a start on or after that date
//   likely:    no exact date, but it's aimed at 2027 starters ("2027 intake", "final-year students")
//   before:    it states an earlier start, or an immediate / ASAP start
//   unknown:   it doesn't say (the daily job then reads the employer's own page, and
//              counts it as likely when the same employer's other graduate roles are for 2027)
export type StartStatus = "confirmed" | "likely" | "before" | "unknown";

// "Graduate Accountant", "Finance Graduate", "Graduate - Marketing" are graduate jobs; titles
// that only say the job suits graduates ("...ideal for graduates", "graduates welcome") aren't.
export function isGraduateTitle(title: string): boolean {
  if (!/\b(graduate|grad)\b/i.test(title)) return false;
  if (/\b(for|ideal for|suit(s|able for)?|welcome|recent|attention|calling all|open to|including|and)\s+(recent\s+)?graduates?\b|\bgraduates?\s+(welcome|wanted|considered|encouraged)\b|\bnon[- ]graduate\b|\bgraduate (calibre|level|caliber)\b/i.test(title)) return false;
  return true;
}

export function startStatus(tags: RoleTags, earliestStart: string): StartStatus {
  if (tags.startDate && tags.startText !== tags.startDate.slice(0, 4)) {
    return tags.startDate >= earliestStart ? "confirmed" : "before";
  }
  if (tags.immediateStart || tags.tempTitle) return "before";
  if (tags.startText && /^\d{4}$/.test(tags.startText)) {
    return Number(tags.startText) >= Number(earliestStart.slice(0, 4)) ? "likely" : "before";
  }
  if (tags.aimedAt2027) return "likely";
  // A graduate scheme or programme advertised in this recruiting season (autumn 2026 onwards)
  // is for the 2027 intake, even when the listing doesn't repeat the date.
  if (tags.programmeTitle || tags.graduateTitle) return "likely";
  return "unknown";
}

export function tagListing(title: string, description: string): RoleTags {
  const text = `${title}\n${description}`;

  let degree: RoleTags["degree"] = null;
  if (/\b2[:.]2\b|\blower second\b/i.test(text)) degree = "2:2";
  else if (/\b2[:.]1\b|\bupper second\b/i.test(text)) degree = "2:1";
  else if (/\bfirst[- ]class\b/i.test(text)) degree = "First";

  let sponsorship: RoleTags["sponsorship"] = null;
  if (NO_SPONSORSHIP.some((re) => re.test(text))) sponsorship = "not_offered";
  else if (OFFERS_SPONSORSHIP.some((re) => re.test(text))) sponsorship = "offered";

  const { startText, startDate } = findStart(text);

  return {
    degree,
    sponsorship,
    stages: STAGES.filter(([, re]) => re.test(text)).map(([label]) => label),
    drivingLicence: /\b(full\s+(uk\s+)?(driving\s+)?licen[cs]e|driving\s+licen[cs]e\s+(is\s+)?(required|essential)|must\s+(hold|have)\s+a\s+(valid\s+|full\s+)*(uk\s+)?driving\s+licen[cs]e)\b/i.test(text),
    startText,
    startDate,
    deadline: findDeadline(text),
    lengthMonths: findLengthMonths(text),
    graduateTitle: isGraduateTitle(title),
    tempTitle: /\b(temp|temporary|interviewing now|immediate(ly)?|asap|start (this|next) week|christmas|seasonal)\b/i.test(title),
    programmeTitle: /\b(graduate|grad)\b.{0,30}\b(scheme|programme|program|intake|cohort|academy|rotation)\b|\b(scheme|programme|program)\b.{0,30}\bgraduates?\b|\bgraduate development\b/i.test(title),
    abroad: countryOf(title, ""),
    salaryCompetitive: /\b(competitive (salary|pay|package|remuneration|starting salary|base)|salary:?\s*(is\s*)?competitive|salary\s*-\s*competitive)\b/i.test(text),
    graduateScheme: /\bgraduate\s+(scheme|programme|program|trainee|development programme|training scheme)\b/i.test(text),
    immediateStart: /\b(immediate(ly)? start|start(ing)? (asap|immediately|straight away)|asap start|available to start immediately|start date:?\s*(asap|immediate))/i.test(text),
    aimedAt2027: /\b(graduate|programme|program|scheme|intake|rotation|cohort)\b[^\n.]{0,40}\b2027\b|\b2027\b[^\n.]{0,25}\b(graduate|programme|program|scheme|intake|cohort)\b|\b(class of 2027|2027 (graduates?|intake|cohort|start|entry)|graduating (in |summer )?2027|final[- ]year (students?|undergraduates?)|penultimate[- ]year|(due to )?graduate in 2027|for 2027 start)\b/i.test(text),
  };
}

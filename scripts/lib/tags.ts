// Free text rules (no AI) that read a listing and pull out the facts users filter on.
// Anything a listing doesn't mention stays null, so the UI can show "not stated".

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
};

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MONTH_RE = MONTHS.join("|");
const SEASON_MONTH: Record<string, number> = { spring: 3, summer: 6, autumn: 9, winter: 12 };
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eighteen: 18, twelve: 12, "twenty-four": 24,
};

const NO_SPONSORSHIP = [
  /\b(unable|not able|cannot|can ?not|can't|do not|don't|will not|won't|not in a position)\s+(to\s+)?(offer|provide|support|consider)?\s*(any\s+)?(visa\s+)?sponsor/i,
  /\bno\s+(visa\s+)?sponsorship\b/i,
  /\bsponsorship\s+(is\s+)?(not|unavailable)\b/i,
  /\bwithout\s+(the\s+need\s+for\s+)?(visa\s+)?sponsorship\b/i,
  /\bdoes\s+not\s+offer\s+(visa\s+)?sponsorship\b/i,
];
const OFFERS_SPONSORSHIP = [
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
  const m = MONTHS.indexOf(month.toLowerCase()) + 1 || SEASON_MONTH[month.toLowerCase()] || 1;
  return `${year}-${String(m).padStart(2, "0")}-01`;
}

function findStart(text: string): { startText: string | null; startDate: string | null } {
  const patterns = [
    new RegExp(`\\b(${MONTH_RE}|spring|summer|autumn|winter)\\s+(202[6-9])\\s+(start|intake|cohort|entry)`, "i"),
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

function findDeadline(text: string): string | null {
  const re = new RegExp(
    `\\b(?:closing date|deadline|applications? close|close[sd]? on|apply by|applications? (?:must be|should be) (?:received|submitted) by)\\b[^.\\n]{0,25}?\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\s*,?\\s*(202[6-9])?`,
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

// Scope rule: does this listing read as a graduate / entry-level role? Reed's own graduate
// flag and keyword searches also return senior roles and, for "2027", contracts ending in
// 2027, so every source listing passes through this before it joins the feed.
const SENIOR_TITLE = /\b(senior|snr|sr|principal|head of|director|vp|chief|consultant surgeon|partner)\b|\b(team|tech|technical|project|engineering|design|mechanical|electrical|site|shift)\s+lead\b/i;
const EARLY_TITLE = /\b(graduate|grad|trainee|junior|entry[- ]level|apprentice|intern|internship|placement|assistant|associate|analyst|coordinator|executive|administrator|advisor|adviser)\b/i;
const EARLY_TEXT = /\b(graduates?|grad (scheme|programme)|entry[- ]level|trainee|recent(ly)? graduated?|no (prior |previous )?experience (is )?(required|needed|necessary)|full training (is )?(given|provided)|early careers?|first (step|role) in your career|(start|intake|cohort|join\w*)\b[^.\n]{0,25}\b2027|2027 (start|intake|cohort|graduate))\b/i;

export function isEarlyCareer(title: string, description: string): boolean {
  if (SENIOR_TITLE.test(title) && !/\b(graduate|trainee|junior)\b/i.test(title)) return false;
  if (/\b(graduate|grad|trainee|entry[- ]level|junior)\b/i.test(title)) return true;
  return EARLY_TEXT.test(`${title}\n${description}`) && (EARLY_TITLE.test(title) || /\bgraduates?\b/i.test(description));
}

// Cross-check sources come from graduate-specific searches but have no description, so
// they're only rejected when the title is clearly senior.
export function isSeniorTitle(title: string): boolean {
  return SENIOR_TITLE.test(title) && !/(graduate|trainee|junior)/i.test(title);
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
    graduateScheme: /\bgraduate\s+(scheme|programme|program|trainee|development programme|training scheme)\b/i.test(text),
  };
}

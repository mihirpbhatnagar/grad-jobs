// Free CV tools (no AI, no cost): keyword match, CV bullet check, "sounds like AI" check and a
// cover letter plan. Pure functions, used in the browser and to brief the paid AI tools.

// Skills and keywords graduate job ads ask for, each with the other ways people write it.
const SKILLS: [string, string[]][] = [
  ["Excel", ["excel", "spreadsheet", "vlookup", "pivot table"]],
  ["SQL", ["sql"]],
  ["Python", ["python"]],
  ["R", [" r ", "rstudio"]],
  ["Power BI", ["power bi", "powerbi"]],
  ["Tableau", ["tableau"]],
  ["Google Analytics", ["google analytics", "ga4"]],
  ["CRM systems", ["crm", "salesforce", "hubspot", "dynamics"]],
  ["Adobe Creative Suite", ["adobe", "photoshop", "illustrator", "indesign", "premiere"]],
  ["Canva", ["canva"]],
  ["Microsoft Office", ["microsoft office", "ms office", "powerpoint", " word ", "outlook"]],
  ["Data analysis", ["data analysis", "analysing data", "analyzing data", "analytical", "analytics", "insight"]],
  ["Financial modelling", ["financial model", "valuation", "dcf"]],
  ["Budgeting and forecasting", ["budget", "forecast"]],
  ["Accounting", ["accounting", "accounts", "aca", "acca", "cima", "bookkeeping"]],
  ["Project management", ["project management", "managed a project", "project manager", "delivered a project", "prince2"]],
  ["Agile", ["agile", "scrum", "sprint"]],
  ["Stakeholder management", ["stakeholder"]],
  ["Communication", ["communicat", "written and verbal", "verbal and written"]],
  ["Presentation skills", [" present", "public speaking", " pitch"]],
  ["Teamwork", ["team", "collaborat"]],
  ["Leadership", [" lead", " led ", "captain", "president", "head of", "managed a team", "supervis"]],
  ["Problem solving", ["problem solving", "problem-solving", "solve problems", "solving problems"]],
  ["Attention to detail", ["attention to detail", "detail-oriented", "detail oriented", "accuracy", "accurate"]],
  ["Time management", ["time management", "prioritis", "prioritiz", "deadlines", "organised", "organized"]],
  ["Negotiation", ["negotiat"]],
  ["Customer service", ["customer service", "customer-facing", "customer facing", "client-facing", "client facing"]],
  ["Sales", ["sales", "selling", "targets", "upsell", "business development"]],
  ["Marketing", ["marketing", "campaign"]],
  ["Social media", ["social media", "instagram", "tiktok", "linkedin content", "twitter", "facebook"]],
  ["Content creation", ["content creation", "content", "copywrit", "blog", "video editing"]],
  ["SEO", ["seo", "search engine"]],
  ["Market research", ["market research", "research", "survey", "focus group"]],
  ["Report writing", ["report writing", "reports", "written report"]],
  ["Event management", ["event", "matchday", "match day", "hospitality"]],
  ["Partnerships and sponsorship", ["partnership", "sponsorship", "sponsor activation", "brand partner"]],
  ["Commercial awareness", ["commercial awareness", "commercially aware", "commercial acumen", "business acumen"]],
  ["Relationship building", ["relationship"]],
  ["Coaching and mentoring", ["coach", "mentor", "tutor"]],
  ["Languages", ["fluent", "bilingual", "hindi", "spanish", "french", "german", "mandarin", "arabic"]],
  ["Driving licence", ["driving licence", "driving license", "full uk licence"]],
  ["Resilience", ["resilien", "under pressure", "fast-paced", "fast paced"]],
  ["Initiative", ["initiative", "self-motivated", "self motivated", "proactive", "self-starter"]],
  ["Creativity", ["creativ", "innovat"]],
  ["Numeracy", ["numerate", "numeracy", "numerical", "quantitative"]],
  ["Sustainability / ESG", ["sustainab", "esg", "net zero", "carbon"]],
  ["Supply chain and logistics", ["supply chain", "logistics", "procurement", "inventory"]],
  ["Recruitment / HR", ["recruitment", "talent acquisition", "hr ", "human resources", "people team"]],
  ["Policy and public sector", ["policy", "public sector", "government", "civil service"]],
];

const has = (text: string, words: string[]) => words.some((w) => text.includes(w));

export type KeywordMatch = { term: string; inCv: boolean; inStoryBank: boolean }[];

// What the job asks for, and whether the CV (or story bank) shows it.
export function keywordMatch(description: string, cvText: string, storyBank: string): KeywordMatch {
  const job = ` ${description.toLowerCase()} `;
  const cv = ` ${cvText.toLowerCase()} `;
  const stories = ` ${storyBank.toLowerCase()} `;
  return SKILLS.filter(([, words]) => has(job, words)).map(([term, words]) => ({ term, inCv: has(cv, words), inStoryBank: has(stories, words) }));
}

// Story bank notes: one per line or paragraph, without bullet marks.
export function storyEntries(storyBank: string): string[] {
  return storyBank
    .split(/\n+/)
    .map((l) => l.replace(/^\s*[-•*–\d.)]+\s*/, "").trim())
    .filter((l) => l.length > 15);
}

// CV lines that read like bullet points (what you did), not headings or contact details.
export function cvBullets(cvText: string): string[] {
  return cvText
    .split(/\n+/)
    .map((l) => l.replace(/^\s*[-•*▪●◦–]\s*/, "").replace(/\s+/g, " ").trim())
    .filter((l) => l.split(" ").length >= 6 && l.length <= 400 && !/@|https?:|linkedin\.com|\+44|\b0\d{3,4} ?\d{3}/i.test(l));
}

const WEAK_OPENERS = /^(responsible for|helped|assisted|worked on|duties included|involved in|tasked with|participated in|was part of|i was|my role was)\b/i;
const NUMBER = /\d|%|£|\b(one|two|three|four|five|six|seven|eight|nine|ten|dozen|hundred|thousand)\b/i;

export type BulletNote = { text: string; issues: string[] };

// Free CV bullet check: weak openers, no numbers, too long, "I".
export function bulletNotes(bullets: string[]): BulletNote[] {
  return bullets.map((text) => {
    const issues: string[] = [];
    if (WEAK_OPENERS.test(text)) issues.push("Starts weakly: open with a strong verb (Led, Built, Grew, Organised)");
    if (!NUMBER.test(text)) issues.push("No number: add a result or scale (how many, how much, how often)");
    if (text.split(" ").length > 32) issues.push("Long: aim for one or two lines");
    if (/\bI\b/.test(text)) issues.push("Drop \"I\": CV bullets start with the verb");
    return { text, issues };
  });
}

// Phrases that make writing sound generic or machine-written, with plainer alternatives.
const AI_PHRASES: [RegExp, string][] = [
  [/\bpassionate about\b/i, "Say what you did about it: \"I've spent two seasons running…\""],
  [/\bleverag(e|ed|ing)\b/i, "used"],
  [/\butili[sz](e|ed|ing)\b/i, "used"],
  [/\bspearhead(ed|ing)?\b/i, "led / started"],
  [/\bdelve\b/i, "look into"],
  [/\btapestry\b/i, "mix"],
  [/\bin today'?s (fast-paced|ever-changing|dynamic)\b/i, "Cut it: start with your point"],
  [/\bfast-paced environment\b/i, "Name the real pressure: \"three deadlines a week\""],
  [/\bdynamic (team|environment|individual)\b/i, "Cut \"dynamic\""],
  [/\bsynerg(y|ies|istic)\b/i, "working together"],
  [/\bthrive\b/i, "do well / enjoy"],
  [/\bhone[ds]? my\b/i, "improve my / build my"],
  [/\bunwavering\b/i, "steady / real"],
  [/\bseamless(ly)?\b/i, "smooth(ly)"],
  [/\brobust\b/i, "strong / reliable"],
  [/\bcutting[- ]edge\b/i, "new / latest"],
  [/\bgame[- ]changer\b/i, "Say what changed"],
  [/\bembark(ed|ing)? on\b/i, "started"],
  [/\bjourney\b/i, "time at / experience of"],
  [/\bfoster(ed|ing)?\b/i, "built / encouraged"],
  [/\bplethora\b/i, "lots of"],
  [/\bmyriad\b/i, "many"],
  [/\bmeticulous(ly)?\b/i, "careful(ly)"],
  [/\bresonate[sd]? with me\b/i, "Say why, specifically"],
  [/\bI am writing to express my (keen )?interest\b/i, "Open with why this role: \"Your graduate scheme stood out because…\""],
  [/\bI believe I would be a great fit\b/i, "Show it with one example instead"],
  [/\bproven track record\b/i, "Give the record: one result with a number"],
  [/\bteam player\b/i, "Describe one team moment"],
  [/\bhard[- ]working\b/i, "Show it: hours, load, results"],
  [/\bexcellent communication skills\b/i, "Show one time you communicated well"],
  [/\bgo the extra mile\b/i, "Say what extra you did"],
  [/\bat the forefront\b/i, "leading"],
  [/\bnavigat(e|ed|ing) (the )?(complexities|challenges)\b/i, "dealt with"],
  [/\bin conclusion\b/i, "Cut it"],
  [/\bfurthermore\b/i, "also"],
  [/\bmoreover\b/i, "also"],
  [/\bnot only .{3,40} but also\b/i, "Two short sentences read more naturally"],
  [/—/, "Em dashes are an AI tell: use a comma, full stop or brackets"],
];

export type PhraseHit = { phrase: string; tip: string };

export function aiPhraseCheck(text: string): { hits: PhraseHit[]; level: "Low" | "Medium" | "High"; longSentences: number } {
  const hits: PhraseHit[] = [];
  for (const [re, tip] of AI_PHRASES) {
    const m = text.match(re);
    if (m) hits.push({ phrase: m[0], tip });
  }
  const longSentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.split(" ").length > 35).length;
  const score = hits.length + longSentences;
  return { hits, level: score >= 5 ? "High" : score >= 2 ? "Medium" : "Low", longSentences };
}

// A cover letter plan (structure only, never the letter): each paragraph says what to cover,
// with the user's own best-matching stories slotted in.
export function coverLetterPlan(company: string, title: string, stories: string[], missing: string[]): { heading: string; points: string[] }[] {
  return [
    {
      heading: "1. Why this role, why this company (3–4 lines)",
      points: [
        `Name one specific thing about ${company}: a value, project, client or recent news, and why it matters to you.`,
        `Say why the ${title} role in particular, not graduate schemes in general.`,
      ],
    },
    {
      heading: "2. Your strongest proof (one story)",
      points: stories[0] ? [`Use: "${stories[0]}"`, "Situation in one line, what you did, the result with a number, then link it to what the role needs."] : ["Add notes to your story bank to see your best-matching experience here."],
    },
    {
      heading: "3. A second, different strength",
      points: stories[1] ? [`Use: "${stories[1]}"`, "Pick a different skill from paragraph 2 (e.g. teamwork after analysis)."] : ["Pick a second experience showing a different skill."],
    },
    {
      heading: "4. Close (2 lines)",
      points: [
        missing.length ? `If honest, address a gap briefly, e.g. what you're doing to build ${missing.slice(0, 2).join(" or ")}.` : "Restate what you'd bring in one line.",
        "Thank them and say you'd welcome the chance to talk. No clichés.",
      ],
    },
  ];
}

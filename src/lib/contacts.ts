// Networking help (free, no scraping): contact details a listing states itself, and LinkedIn
// search links the user opens themselves. LinkedIn is never read or automated by the app.

export type Contact = { kind: "email" | "person"; label: string; detail?: string; href?: string };

const IGNORE_EMAIL = /^(no-?reply|donotreply|privacy|dpo|gdpr|data\.?protection|accessibility|info@|support)/i;

// Names and emails a listing gives for applying or questions, e.g. "contact Jane Smith at
// jane.smith@firm.com" or "Hiring manager: Tom Lee".
export function contactsFromDescription(text: string | null): Contact[] {
  if (!text) return [];
  const out: Contact[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    const email = m[0].replace(/\.$/, "").toLowerCase();
    if (IGNORE_EMAIL.test(email) || seen.has(email)) continue;
    seen.add(email);
    const before = text.slice(Math.max(0, (m.index ?? 0) - 120), m.index).replace(/\s+/g, " ");
    const context = /recruit|talent|early careers|graduate|hiring|resourcing|hr\b|people team|question|contact|enquir/i.test(before) ? "From the listing" : "Email in the listing";
    out.push({ kind: "email", label: email, detail: context, href: `mailto:${email}` });
  }
  const NAME = "([A-Z][a-z]+(?:[- ][A-Z][a-z']+){1,2})";
  const patterns = [
    new RegExp(`(?:hiring manager|line manager|recruiter|recruitment partner|talent (?:partner|acquisition partner)|contact)\\s*(?:is|:|-)?\\s*${NAME}`, "g"),
    new RegExp(`(?:please )?(?:contact|speak to|reach out to|email)\\s+${NAME}`, "g"),
    new RegExp(`reporting (?:in)?to\\s+${NAME}`, "g"),
  ];
  const notNames = /^(The|Our|Your|Human|Early|Graduate|Talent|Careers?|Recruitment|Resourcing|People|Team|Us|Head|Senior|Please)\b/;
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const name = m[1].trim();
      if (notNames.test(name) || seen.has(name)) continue;
      seen.add(name);
      const around = text.slice(m.index ?? 0, (m.index ?? 0) + 80);
      const role = /hiring manager/i.test(around) ? "Hiring manager" : /line manager|reporting/i.test(around) ? "Line manager" : "Named in the listing";
      out.push({ kind: "person", label: name, detail: role });
    }
  }
  return out.slice(0, 6);
}

const li = (keywords: string) => `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
const LBORO = "https://www.linkedin.com/school/loughborough-university/people/";

// Searches the user opens on LinkedIn: people who are likely to reply (recruiters, recent
// graduates, Loughborough alumni), not senior names.
export function networkingLinks(company: string) {
  const name = company.replace(/\b(ltd|limited|plc|llp|uk|group)\b\.?/gi, "").trim();
  return [
    { label: `Loughborough alumni at ${name}`, detail: "Fellow Lboro grads are the most likely to reply", href: `${LBORO}?keywords=${encodeURIComponent(name)}` },
    { label: `Recent graduates at ${name}`, detail: "People 1–3 years into the same scheme", href: li(`${name} graduate`) },
    { label: `Early-careers recruiters at ${name}`, detail: "The team that runs graduate hiring", href: li(`${name} early careers recruiter`) },
  ];
}

// Field-level searches for the "People to reach out to" column.
export function fieldLinks(fieldLabel: string) {
  const short = fieldLabel.split(" and ")[0].split(",")[0];
  return { label: `Lboro alumni in ${short.toLowerCase()}`, href: `${LBORO}?keywords=${encodeURIComponent(short)}` };
}

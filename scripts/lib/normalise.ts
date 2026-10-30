import { createHash } from "node:crypto";

// Name cleaning used for duplicate detection and sponsor matching.

const LEGAL_SUFFIXES = new Set([
  "ltd", "limited", "plc", "llp", "lp", "inc", "llc", "corp", "corporation", "co", "company", "the",
]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

// "The Boots Company PLC" -> "boots"; "Deloitte LLP" -> "deloitte".
export function companyKey(name: string): string {
  return words(name).filter((w) => !LEGAL_SUFFIXES.has(w)).join(" ");
}

export function textKey(text: string): string {
  return words(text).join(" ");
}

// First part of a location ("London, South East England" -> "london").
export function townKey(location: string | null | undefined): string {
  if (!location) return "";
  return textKey(location.split(",")[0]);
}

// Same employer + same title + same wording = the same job. Location is deliberately left
// out: some employers post one scheme 90 times, once per town, and that is one role with
// many locations, not 90 roles.
export function dedupeKey(employer: string, title: string, description: string): string {
  const fingerprint = createHash("sha1").update(textKey(description).slice(0, 600)).digest("hex").slice(0, 12);
  return `${companyKey(employer)}|${textKey(title)}|${fingerprint}`;
}

// Reed sometimes gives a bare postcode ("EC2V7AN") as the location. Map the postcode area
// to its town so people can read it and the location filter can find it.
const POSTCODE_AREAS: Record<string, string> = {
  EC: "London", WC: "London", E: "London", N: "London", NW: "London", SE: "London", SW: "London", W: "London",
  M: "Manchester", B: "Birmingham", EH: "Edinburgh", G: "Glasgow", LS: "Leeds", BS: "Bristol", L: "Liverpool",
  NG: "Nottingham", S: "Sheffield", NE: "Newcastle upon Tyne", CF: "Cardiff", LE: "Leicester", CB: "Cambridge",
  OX: "Oxford", RG: "Reading", MK: "Milton Keynes", BN: "Brighton", SO: "Southampton", AB: "Aberdeen",
  BT: "Belfast", WR: "Worcester", HR: "Hereford", TF: "Telford", WV: "Wolverhampton", WS: "Walsall", DY: "Dudley", NN: "Northampton", PE: "Peterborough", IP: "Ipswich", CO: "Colchester", CM: "Chelmsford", SS: "Southend-on-Sea", ME: "Maidstone", CT: "Canterbury", TN: "Tonbridge", RH: "Redhill", KT: "Kingston upon Thames", CR: "Croydon", BR: "Bromley", DA: "Dartford", HA: "Harrow", UB: "Uxbridge", TW: "Twickenham", EN: "Enfield", IG: "Ilford", RM: "Romford", WD: "Watford", AL: "St Albans", HP: "Hemel Hempstead", SG: "Stevenage", OL: "Oldham", BL: "Bolton", WN: "Wigan", PR: "Preston", BB: "Blackburn", FY: "Blackpool", LA: "Lancaster", CA: "Carlisle", DH: "Durham", DL: "Darlington", TS: "Middlesbrough", SR: "Sunderland", HG: "Harrogate", BD: "Bradford", HD: "Huddersfield", HX: "Halifax", WF: "Wakefield", DN: "Doncaster", LN: "Lincoln", CH: "Chester", SK: "Stockport", BA: "Bath", GL: "Gloucester", SN: "Swindon", TA: "Taunton", TQ: "Torquay", TR: "Truro", DT: "Dorchester", BH: "Bournemouth", SP: "Salisbury", NP: "Newport", SA: "Swansea", LL: "Llandudno", KY: "Kirkcaldy", DD: "Dundee", PH: "Perth", IV: "Inverness", FK: "Falkirk", ML: "Motherwell", KA: "Kilmarnock", PA: "Paisley", CV: "Coventry", DE: "Derby", LU: "Luton", SL: "Slough", GU: "Guildford", WA: "Warrington",
  YO: "York", PO: "Portsmouth", EX: "Exeter", PL: "Plymouth", NR: "Norwich", HU: "Hull", ST: "Stoke-on-Trent",
};

export function prettyLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const m = location.trim().toUpperCase().match(/^([A-Z]{1,2})\d[A-Z\d]?\s*\d[A-Z]{2}$/);
  if (!m) return location.trim();
  const town = POSTCODE_AREAS[m[1]];
  return town ? `${town} (${location.trim().toUpperCase().replace(/^(.+?)(\d[A-Z]{2})$/, "$1 $2").replace(/\s+/g, " ")})` : location.trim();
}

export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\s*(br|\/p|\/li|\/h\d|\/div)\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&pound;/g, "£")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

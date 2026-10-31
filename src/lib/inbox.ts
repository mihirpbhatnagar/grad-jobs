import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiAvailable, usageOf } from "@/lib/ai";
import { isBoardName } from "@/lib/format";
import { decryptToken, googleClientId } from "@/lib/gmail";
import type { Stage } from "@/lib/pipeline";

// Inbox sync: reads only emails from employers the user has applications with (and the hiring
// systems they use), works out what each one means, and moves the application along. Free text
// rules first; Claude Haiku only for the emails the rules can't place. Nothing else is stored.

type Outcome = Stage | "received";

// Hiring systems that send emails on employers' behalf.
const ATS_SENDERS = [
  "greenhouse.io", "greenhouse-mail.io", "lever.co", "hire.lever.co", "ashbyhq.com", "smartrecruiters.com", "workablemail.com", "workable.com",
  "myworkday.com", "myworkdayjobs.com", "successfactors.com", "successfactors.eu", "taleo.net", "oraclecloud.com", "icims.com", "tal.net",
  "oleeo.com", "pinpointhq.com", "teamtailor.com", "jobvite.com", "avature.net", "eightfold.ai", "beapplied.com", "hirevue.com",
  "cappfinity.com", "sova.ai", "amberjack.co.uk", "arctic-shores.com", "hackerrank.com", "codility.com", "talentlens.com", "shl.com",
];

// Most specific first: an offer email often says "interview" too.
const RULES: [Outcome, RegExp][] = [
  ["offer", /\b(offer of employment|pleased to (offer|extend)|job offer|offer letter|formal offer)\b/i],
  ["rejected", /\b(unfortunately|unsuccessful|not (be )?(progress|proceed|mov)ing|decided not to|regret to|other candidates|not been selected|no longer being considered)\b/i],
  ["assessment_centre", /\b(assessment (centre|center|day)|final[- ]stage (event|day))\b/i],
  ["interview", /\b(interview|hirevue|video assessment)\b/i],
  ["test", /\b(online (test|assessment)|aptitude|numerical|verbal reasoning|situational judge?ment|psychometric|game[- ]based|cappfinity|sova|amberjack|arctic shores|hackerrank|codility|coding (test|challenge)|immersive assessment)\b/i],
  ["received", /\b(thank(s| you) for (your )?(appl\w*|interest)|application (has been )?(received|submitted)|we('ve| have) received your|received your application|application confirmation)\b/i],
];

const RANK: Record<Stage, number> = { saved: 0, applying: 1, applied: 2, test: 3, interview: 4, assessment_centre: 5, offer: 6, rejected: 6 };

function ruleOutcome(text: string): Outcome | null {
  return RULES.find(([, re]) => re.test(text))?.[0] ?? null;
}

// "Deloitte UK Ltd" -> ["deloitte uk", "deloitte"]: names to look for in the sender and subject.
function nameVariants(name: string): string[] {
  const clean = name.toLowerCase().replace(/&/g, "and").replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
  const core = clean.replace(/\b(ltd|limited|plc|llp|llc|inc|group|holdings|uk|the|company|co)\b/g, " ").replace(/\s+/g, " ").trim();
  const first = core.split(" ")[0];
  return [...new Set([clean, core, first.length >= 5 ? first : ""])].filter((v) => v.length >= 3);
}

type App = { id: number; role_id: number | null; stage: Stage; applied_at: string | null; names: string[] };
type Mail = { id: string; from: string; subject: string; snippet: string; date: string };

async function accessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: googleClientId(), client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  if (!res.ok) throw new Error(res.status === 400 ? "gmail_revoked" : `Google token refresh failed (${res.status})`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function gmail<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail ${res.status}`);
  return (await res.json()) as T;
}

// One Haiku call for all the emails the rules couldn't place (subject + Gmail's short preview only).
async function aiOutcomes(db: SupabaseClient, userId: string, mails: Mail[]): Promise<Map<string, Outcome | null>> {
  const out = new Map<string, Outcome | null>();
  if (!mails.length || !aiAvailable()) return out;
  const model = "claude-haiku-5-5";
  const list = mails.map((m, i) => `${i + 1}. From: ${m.from}\nSubject: ${m.subject}\nPreview: ${m.snippet}`).join("\n\n");
  const response = await new Anthropic().messages.create({
    model,
    max_tokens: 400,
    system:
      "You sort emails a graduate job applicant got from employers. For each, answer with exactly one label: received (application acknowledged), test (online test or assessment invite), interview (interview invite, incl. video), assessment_centre, offer, rejected, or none (marketing, newsletters, job alerts, anything else). Reply with one line per email: number, colon, label.",
    messages: [{ role: "user", content: list }],
  });
  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const labels: Outcome[] = ["received", "test", "interview", "assessment_centre", "offer", "rejected"];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(\d+)\s*[:.)-]\s*([a-z_]+)/i);
    if (!m) continue;
    const mail = mails[Number(m[1]) - 1];
    const label = m[2].toLowerCase() as Outcome;
    if (mail) out.set(mail.id, labels.includes(label) ? label : null);
  }
  const usage = usageOf(model, response.usage);
  await db.from("ai_outputs").insert({
    user_id: userId,
    kind: "inbox",
    content: `Sorted ${mails.length} employer email${mails.length === 1 ? "" : "s"}`,
    model,
    input_tokens: usage.input,
    output_tokens: usage.output,
    cost_usd: usage.costUsd,
  });
  return out;
}

const NOTE: Record<Outcome, string> = {
  received: "Application received",
  applied: "Applied",
  test: "Test invite",
  interview: "Interview invite",
  assessment_centre: "Assessment centre invite",
  offer: "Offer",
  rejected: "Rejected",
  saved: "Saved",
  applying: "Applying",
};

// Checks the signed-in user's Gmail (their own session; row-level security applies throughout).
// Returns how many applications were updated.
export async function syncInbox(db: SupabaseClient, userId: string): Promise<number> {
  const { data: link } = await db.from("gmail_links").select("refresh_token,last_synced_at,linked_at").maybeSingle();
  if (!link) return 0;
  const startedAt = new Date().toISOString();
  await db.from("gmail_links").update({ last_synced_at: startedAt }).eq("user_id", userId);

  const { data: rows } = await db.from("saved_roles").select("id,role_id,stage,applied_at,saved_at,company,role:roles(employer)");
  const apps: App[] = ((rows ?? []) as unknown as { id: number; role_id: number | null; stage: Stage; applied_at: string | null; saved_at: string; company: string | null; role: { employer: string } | null }[])
    .map((r) => ({ ...r, names: nameVariants(r.role && !isBoardName(r.role.employer) ? r.role.employer : (r.company ?? "")) }))
    .filter((a) => a.names.length && a.stage !== "offer");
  if (!apps.length) return 0;

  // From the last check (first time: 60 days back), looking only for these employers and hiring systems.
  const since = Math.floor(new Date(link.last_synced_at ?? Date.now() - 60 * 86_400_000).getTime() / 1000) - 3600;
  const names = [...new Set(apps.map((a) => a.names[1] ?? a.names[0]))].map((n) => `"${n}"`);
  const q = `after:${since} -in:sent -in:chats {${[...names, ...ATS_SENDERS.map((d) => `from:${d}`)].join(" ")}}`;
  const token = await accessToken(decryptToken(link.refresh_token));
  const list = await gmail<{ messages?: { id: string }[] }>(token, `messages?maxResults=60&q=${encodeURIComponent(q)}`);
  const ids = (list.messages ?? []).map((m) => m.id);
  if (!ids.length) return 0;

  const { data: seen } = await db.from("application_events").select("email_id").in("email_id", ids);
  const done = new Set((seen ?? []).map((s) => s.email_id));
  const mails: Mail[] = [];
  for (const id of ids.filter((i) => !done.has(i))) {
    const m = await gmail<{ snippet: string; internalDate: string; payload: { headers: { name: string; value: string }[] } }>(
      token,
      `messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
    );
    const h = (n: string) => m.payload.headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? "";
    mails.push({ id, from: h("From"), subject: h("Subject"), snippet: m.snippet ?? "", date: new Date(Number(m.internalDate)).toISOString() });
  }

  // Match each email to one application by the employer's name; emails that match none are dropped.
  const matched = mails
    .map((mail) => {
      const text = `${mail.from} ${mail.subject} ${mail.snippet}`.toLowerCase();
      const app = apps.filter((a) => a.names.some((n) => text.includes(n))).sort((a, b) => RANK[b.stage] - RANK[a.stage])[0];
      return app ? { mail, app } : null;
    })
    .filter((x): x is { mail: Mail; app: App } => !!x)
    .sort((a, b) => a.mail.date.localeCompare(b.mail.date));

  const byRule = new Map(matched.map(({ mail }) => [mail.id, ruleOutcome(`${mail.subject} ${mail.snippet}`)]));
  const byAi = await aiOutcomes(db, userId, matched.filter(({ mail }) => !byRule.get(mail.id)).map(({ mail }) => mail));

  let changed = 0;
  for (const { mail, app } of matched) {
    const outcome = byRule.get(mail.id) ?? byAi.get(mail.id) ?? null;
    if (!outcome) continue;
    const next: Stage = outcome === "received" ? "applied" : outcome;
    const moves = next === "rejected" ? app.stage !== "rejected" : RANK[next] > RANK[app.stage];
    const { error } = await db.from("application_events").insert({
      user_id: userId,
      role_id: app.role_id,
      application_id: app.id,
      stage: moves ? next : null,
      note: `${NOTE[outcome]} (email: ${mail.subject.slice(0, 140) || "no subject"})`,
      email_id: mail.id,
      happened_at: mail.date,
    });
    if (error) continue; // already recorded
    if (moves) {
      const update: Record<string, string> = { stage: next, updated_at: new Date().toISOString() };
      if (next === "applied" && !app.applied_at) update.applied_at = mail.date;
      await db.from("saved_roles").update(update).eq("id", app.id);
      app.stage = next;
    }
    changed++;
  }
  return changed;
}

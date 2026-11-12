import Anthropic from "@anthropic-ai/sdk";
import { publicClient } from "@/lib/supabase";

// The Apply tools. AI is an editor, not a ghostwriter: it never writes cover letters, never
// submits anything and never adds experience the user doesn't have. Runs only when a user
// presses a button, and each result is saved so it is never paid for twice.

export type ToolKind = "brief" | "keywords" | "cv" | "rewrite" | "cover" | "ai_check";

export const TOOLS: Record<ToolKind, { label: string; model: string; effort: "low" | "medium" | "high"; web: boolean }> = {
  brief: { label: "Company brief", model: "claude-sonnet-5-5", effort: "medium", web: true },
  keywords: { label: "Keyword gaps", model: "claude-opus-5-5", effort: "medium", web: false },
  cv: { label: "CV recommendations", model: "claude-opus-5-5", effort: "high", web: false },
  rewrite: { label: "CV rewrite for this role", model: "claude-opus-5-5", effort: "high", web: false },
  cover: { label: "Cover letter pointers", model: "claude-opus-5-5", effort: "medium", web: false },
  ai_check: { label: "Sounds like AI?", model: "claude-haiku-5-5", effort: "low", web: false },
};

// US$ per million tokens (Anthropic list prices); cache writes are 1.25x input.
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};
const WEB_SEARCH_USD = 0.01;

// AI runs only with the key set AND the "ai.enabled" setting on: an overall switch Mihir controls,
// so nothing is spent until he authorises it.
export async function aiAvailable(): Promise<boolean> {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  const { data } = (await publicClient()?.from("settings").select("value").eq("key", "ai.enabled").maybeSingle()) ?? { data: null };
  return data?.value === true;
}

const RULES = `You help UK graduates apply for jobs. You are an editor, not a ghostwriter.
Hard rules:
- Never write a cover letter or any part of one, even if asked. Give structure and points only.
- Never invent, exaggerate or imply experience, skills, grades or results the user doesn't have. Use only what is in their CV and story bank below. If something the role needs is missing, say it's missing and suggest how they could honestly address it.
- Write in plain UK English. Be specific and practical. No filler, no flattery.
- Format with short headings (## Heading) and bullet points (- point). Keep it scannable.

UK graduate CV playbook (follow it in every CV suggestion and rewrite):
- Length and layout: 2 pages maximum (1 is fine for little experience). Reverse chronological. Sections: contact line, short profile (2-3 lines, optional), Education, Experience, Skills, then Achievements/Interests only if they add evidence. No photo, date of birth, nationality or marital status. Never mention visa status.
- Education goes first for graduates: degree, university, expected or achieved grade (e.g. "Predicted 2:1"), dates, 2-3 relevant modules or the dissertation title with one line on what it showed.
- Every experience bullet = strong past-tense verb + what you did + result or scale. Example: weak "Responsible for social media" becomes strong "Grew the club's Instagram from 1,200 to 3,400 followers in one season by planning a weekly matchday content calendar". Only use numbers that are in the user's material; if a number would help but isn't there, write [add number].
- Bullet formula: "Accomplished X, measured by Y, by doing Z". If the user has no outcome number, quantify real inputs instead (people served, events run, posts made, hours a week), and allow honest approximations the user gave (~, ranges). Never make up a figure.
- ATS formatting: one column, no tables, text boxes, images, icons or headers/footers; standard headings (Education, Experience, Skills); consistent dates (e.g. Sep 2024 – Jun 2025); contact details in the main text; plain .docx or text-based PDF.
- Lead with the experiences closest to the job. Part-time jobs, sport, societies and volunteering count: show the transferable skill (customer service shows stakeholder management; captaincy shows leadership).
- Mirror the job's own words for skills the user really has, so employers' screening software (ATS) matches them. Never keyword-stuff skills they don't have.
- Graduate recruiters scan for: degree and grade, evidence of the competencies in the advert (teamwork, leadership, problem solving, communication, commercial awareness), results with numbers, and motivation for the sector. Make those findable in 10 seconds.
- Cut: objectives, "references available on request", lists of soft skills without evidence, school detail beyond one line of A-levels.
- Voice: write like the user, using their own vocabulary from their CV, story bank and style notes. Avoid words that sound AI-written (passionate, leverage, utilise, spearhead, dynamic, synergy, thrive, seamless, robust, delve, journey, foster, meticulous) and em dashes.`;

const TASKS: Record<ToolKind, string> = {
  brief: "Write a company brief for this employer to prepare an application: what they do (3 lines), their values and mission in their own words (quote their site where you can), 2–4 recent news items with dates, and what they look for in graduates. Search the web for the company's own pages and recent news. Say clearly when something couldn't be found.",
  keywords: "Compare the job description with the user's CV. List: (1) important keywords and skills the job asks for that the CV already shows, (2) ones missing from the CV, and for each missing one whether the story bank shows real evidence they could add (quote it) or it's a genuine gap.",
  cv: "Start with a one-line match verdict (strong / partial / stretch) and the 3 requirements that matter most, marking each as shown, partly shown or missing. Then give specific CV recommendations for this role: which experiences to lead with, bullet points to strengthen (show before → after, using only real facts from the CV and story bank), what to cut, and the 3 things this employer will look for first.",
  rewrite: "Rewrite the user's CV tailored to this role, using ONLY facts from their CV and story bank. Keep their real roles, dates and results. Reorder and rephrase to match the job's language. Mark anything you couldn't support with [needs your input]. Output the full CV.",
  cover: "Give cover letter recommendations: suggest which opening hook suits this user and role (something specific the company has done; a challenge from the job ad they have already tackled; their strongest result; or a person they have spoken to), and never an opening like \"I am writing to apply\" or one starting with \"I\". Then a paragraph-by-paragraph structure, then 4–6 specific points to include, each tied to something real from the CV or story bank and something specific about this employer. Do NOT write the letter or any sentences of it.",
  ai_check: "The text below is the user's own draft. Say how much it sounds AI-written (Low / Medium / High) and why, then list specific phrases that sound generic or AI-like, each with a plainer, more personal alternative in the user's own voice. Don't rewrite the whole draft.",
};

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number; webSearches: number; costUsd: number };

// Rough cost of one run, shown on each button before anyone presses it.
export const ESTIMATE_PENCE: Partial<Record<ToolKind, number>> = { brief: 4, cv: 5, rewrite: 8, cover: 4 };

export type ToolContext = {
  cvText: string | null;
  storyBank: string | null;
  styleNotes?: string | null;
  voiceSample?: string | null;
  role: { title: string; employer: string; description: string | null } | null;
  keywordSummary?: string;
  draft?: string;
};

export async function runTool(kind: ToolKind, ctx: ToolContext): Promise<{ text: string; model: string; usage: Usage }> {
  const tool = TOOLS[kind];
  const client = new Anthropic();
  // Stable part first (rules + the user's CV, story bank and style) and cached, so repeat
  // requests for different roles reuse it at a tenth of the price.
  const profile = [
    `## The user's CV\n${ctx.cvText?.slice(0, 20000) || "(no CV uploaded)"}`,
    `## The user's story bank (real experiences, their own notes)\n${ctx.storyBank?.slice(0, 20000) || "(empty)"}`,
    ctx.styleNotes?.trim() ? `## How the user likes to sound (follow this)\n${ctx.styleNotes.slice(0, 3000)}` : "",
    ctx.voiceSample?.trim() ? `## A CV the user edited themselves (their preferred wording and choices: match this voice)\n${ctx.voiceSample.slice(0, 8000)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const roleText = ctx.role
    ? `## The role\n${ctx.role.title} at ${ctx.role.employer}\n\n${(ctx.role.description ?? "(no description)").slice(0, 15000)}${ctx.keywordSummary ? `\n\n## Keyword check (already done by a free tool)\n${ctx.keywordSummary}` : ""}`
    : "";
  const ask = `${TASKS[kind]}\n\n${roleText}${ctx.draft ? `\n\n## The user's draft\n${ctx.draft.slice(0, 8000)}` : ""}`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: ask }];
  const request = () =>
    client.messages.create({
      model: tool.model,
      max_tokens: 16000,
      output_config: { effort: tool.effort },
      system: [
        { type: "text", text: RULES },
        { type: "text", text: profile, cache_control: { type: "ephemeral" } },
      ],
      ...(tool.web ? { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }] } : {}),
      messages,
    } as Anthropic.MessageCreateParamsNonStreaming);
  let response = await request();
  // A web-search turn can pause part-way; sending the assistant's turn back resumes it.
  for (let i = 0; i < 3 && response.stop_reason === "pause_turn"; i++) {
    messages.push({ role: "assistant", content: response.content as Anthropic.ContentBlockParam[] });
    response = await request();
  }

  if (response.stop_reason === "refusal") throw new Error("The request was declined. Try rephrasing your draft.");
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return { text, model: tool.model, usage: usageOf(tool.model, response.usage) };
}

// Exact token counts and cost (US$) of one request, for at-cost tracking.
export function usageOf(model: string, u: Anthropic.Usage): Usage {
  const p = PRICES[model];
  const webSearches = (u as { server_tool_use?: { web_search_requests?: number } }).server_tool_use?.web_search_requests ?? 0;
  return {
    input: u.input_tokens,
    output: u.output_tokens,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    webSearches,
    costUsd:
      (u.input_tokens * p.input + u.output_tokens * p.output + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.input * 1.25) / 1_000_000 +
      webSearches * WEB_SEARCH_USD,
  };
}

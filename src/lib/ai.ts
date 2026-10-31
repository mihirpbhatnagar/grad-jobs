import Anthropic from "@anthropic-ai/sdk";

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
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};
const WEB_SEARCH_USD = 0.01;

export const aiAvailable = () => !!process.env.ANTHROPIC_API_KEY;

const RULES = `You help UK graduates apply for jobs. You are an editor, not a ghostwriter.
Hard rules:
- Never write a cover letter or any part of one, even if asked. Give structure and points only.
- Never invent, exaggerate or imply experience, skills, grades or results the user doesn't have. Use only what is in their CV and story bank below. If something the role needs is missing, say it's missing and suggest how they could honestly address it.
- Write in plain UK English. Be specific and practical. No filler, no flattery.
- Format with short headings (## Heading) and bullet points (- point). Keep it scannable.`;

const TASKS: Record<ToolKind, string> = {
  brief: "Write a company brief for this employer to prepare an application: what they do (3 lines), their values and mission in their own words (quote their site where you can), 2–4 recent news items with dates, and what they look for in graduates. Search the web for the company's own pages and recent news. Say clearly when something couldn't be found.",
  keywords: "Compare the job description with the user's CV. List: (1) important keywords and skills the job asks for that the CV already shows, (2) ones missing from the CV, and for each missing one whether the story bank shows real evidence they could add (quote it) or it's a genuine gap.",
  cv: "Give specific CV recommendations for this role: which experiences to lead with, bullet points to strengthen (show before → after, using only real facts from the CV and story bank), what to cut, and the 3 things this employer will look for first.",
  rewrite: "Rewrite the user's CV tailored to this role, using ONLY facts from their CV and story bank. Keep their real roles, dates and results. Reorder and rephrase to match the job's language. Mark anything you couldn't support with [needs your input]. Output the full CV.",
  cover: "Give cover letter recommendations: a paragraph-by-paragraph structure, then 4–6 specific points to include, each tied to something real from the CV or story bank and something specific about this employer. Do NOT write the letter or any sentences of it.",
  ai_check: "The text below is the user's own draft. Say how much it sounds AI-written (Low / Medium / High) and why, then list specific phrases that sound generic or AI-like, each with a plainer, more personal alternative in the user's own voice. Don't rewrite the whole draft.",
};

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number; webSearches: number; costUsd: number };

export async function runTool(
  kind: ToolKind,
  ctx: { cvText: string | null; storyBank: string | null; role: { title: string; employer: string; description: string | null } | null; draft?: string },
): Promise<{ text: string; model: string; usage: Usage }> {
  const tool = TOOLS[kind];
  const client = new Anthropic();
  // Stable part first (rules + the user's CV and story bank) and cached, so repeat requests
  // for different roles reuse it at a tenth of the price.
  const profile = `## The user's CV\n${ctx.cvText?.slice(0, 20000) || "(no CV uploaded)"}\n\n## The user's story bank (real experiences, their own notes)\n${ctx.storyBank?.slice(0, 20000) || "(empty)"}`;
  const roleText = ctx.role ? `## The role\n${ctx.role.title} at ${ctx.role.employer}\n\n${(ctx.role.description ?? "(no description)").slice(0, 15000)}` : "";
  const ask = `${TASKS[kind]}\n\n${roleText}${ctx.draft ? `\n\n## The user's draft\n${ctx.draft.slice(0, 8000)}` : ""}`;

  const response = await client.messages.create({
    model: tool.model,
    max_tokens: 16000,
    output_config: { effort: tool.effort },
    system: [
      { type: "text", text: RULES },
      { type: "text", text: profile, cache_control: { type: "ephemeral" } },
    ],
    ...(tool.web ? { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }] } : {}),
    messages: [{ role: "user", content: ask }],
  } as Anthropic.MessageCreateParamsNonStreaming);

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

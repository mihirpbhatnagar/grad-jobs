"use server";

import { revalidatePath } from "next/cache";
import { aiAvailable, runTool, TOOLS, type ToolKind } from "@/lib/ai";
import { currentUser } from "@/lib/auth";
import { keywordMatch } from "@/lib/cv-coach";

export type ToolResult = { ok: true; text: string; costUsd: number; createdAt: string } | { ok: false; error: string };

// Paid tools only; keyword gaps and the "sounds like AI" check are free (no AI) now.
const PAID: ToolKind[] = ["brief", "cv", "rewrite", "cover"];

// Runs one Apply tool for the signed-in user and saves the result (and its exact cost).
export async function runApplyTool(kind: ToolKind, roleId: number | null): Promise<ToolResult> {
  if (!PAID.includes(kind) || !(kind in TOOLS)) return { ok: false, error: "Unknown tool" };
  if (!(await aiAvailable())) return { ok: false, error: "The AI tools are switched off for now." };
  const { db, user } = await currentUser();
  if (!user) return { ok: false, error: "Sign in first" };

  // Per-person daily cap (a setting), on top of the monthly limit in the Anthropic Console.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const [{ data: profile }, { data: role }, { data: spent }, { data: cap }] = await Promise.all([
    db.from("profiles").select("cv_text,story_bank,style_notes,cv_voice_sample").maybeSingle(),
    roleId ? db.from("roles").select("title,employer,description").eq("id", roleId).maybeSingle() : Promise.resolve({ data: null }),
    db.from("ai_outputs").select("cost_usd").gte("created_at", today.toISOString()),
    db.from("settings").select("value").eq("key", "ai.daily_cap_usd").maybeSingle(),
  ]);
  const spentToday = (spent ?? []).reduce((n, r) => n + Number(r.cost_usd), 0);
  if (spentToday >= Number(cap?.value ?? 1)) return { ok: false, error: "You've reached today's AI limit. It resets at midnight." };
  if (kind !== "brief" && !profile?.cv_text && !profile?.story_bank) {
    return { ok: false, error: "Upload your CV on your profile (or fill in your story bank) first, so the advice is built from your real experience." };
  }

  const keywords = role?.description ? keywordMatch(role.description, profile?.cv_text ?? "", profile?.story_bank ?? "") : [];
  const keywordSummary = keywords.length
    ? keywords.map((k) => `- ${k.term}: ${k.inCv ? "in CV" : k.inStoryBank ? "only in story bank" : "not shown anywhere"}`).join("\n")
    : undefined;

  try {
    const out = await runTool(kind, {
      cvText: profile?.cv_text ?? null,
      storyBank: profile?.story_bank ?? null,
      styleNotes: profile?.style_notes ?? null,
      voiceSample: profile?.cv_voice_sample ?? null,
      role: role ?? null,
      keywordSummary,
    });
    const { data: saved, error } = await db
      .from("ai_outputs")
      .insert({
        user_id: user.id,
        role_id: roleId,
        kind,
        content: out.text,
        model: out.model,
        input_tokens: out.usage.input,
        output_tokens: out.usage.output,
        cache_read_tokens: out.usage.cacheRead,
        cache_write_tokens: out.usage.cacheWrite,
        web_searches: out.usage.webSearches,
        cost_usd: out.usage.costUsd,
      })
      .select("created_at")
      .single();
    if (error) throw error;
    return { ok: true, text: out.text, costUsd: out.usage.costUsd, createdAt: saved.created_at };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong. Try again in a minute." };
  }
}

// The user's own edit of a CV rewrite: saved as the latest version for this role (free), and
// kept as their voice sample so later rewrites follow their wording and choices.
export async function saveEditedRewrite(roleId: number, text: string): Promise<{ createdAt: string }> {
  const { db, user } = await currentUser();
  if (!user) throw new Error("Sign in first");
  const content = text.trim().slice(0, 30000);
  if (!content) throw new Error("Nothing to save");
  const { data, error } = await db
    .from("ai_outputs")
    .insert({ user_id: user.id, role_id: roleId, kind: "rewrite", content, model: "edited by you", cost_usd: 0 })
    .select("created_at")
    .single();
  if (error) throw error;
  await db.from("profiles").update({ cv_voice_sample: content.slice(0, 12000) }).eq("user_id", user.id);
  return { createdAt: data.created_at };
}

export async function saveStyleNotes(text: string): Promise<void> {
  const { db, user } = await currentUser();
  if (!user) throw new Error("Sign in first");
  const { error } = await db.from("profiles").upsert({ user_id: user.id, style_notes: text.slice(0, 3000) });
  if (error) throw error;
  revalidatePath("/", "layout");
}

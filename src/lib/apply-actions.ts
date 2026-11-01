"use server";

import { aiAvailable, runTool, TOOLS, type ToolKind } from "@/lib/ai";
import { currentUser } from "@/lib/auth";

export type ToolResult = { ok: true; text: string; costUsd: number; createdAt: string } | { ok: false; error: string };

// Runs one Apply tool for the signed-in user and saves the result (and its exact cost).
export async function runApplyTool(kind: ToolKind, roleId: number | null, draft?: string): Promise<ToolResult> {
  if (!(kind in TOOLS)) return { ok: false, error: "Unknown tool" };
  if (!(await aiAvailable())) return { ok: false, error: "The AI tools are switched off for now." };
  const { db, user } = await currentUser();
  if (!user) return { ok: false, error: "Sign in first" };
  if (kind === "ai_check" && !draft?.trim()) return { ok: false, error: "Paste your draft first." };

  const [{ data: profile }, { data: role }] = await Promise.all([
    db.from("profiles").select("cv_text,story_bank").maybeSingle(),
    roleId ? db.from("roles").select("title,employer,description").eq("id", roleId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (kind !== "ai_check" && kind !== "brief" && !profile?.cv_text && !profile?.story_bank) {
    return { ok: false, error: "Upload your CV on your profile (or fill in your story bank) first, so the advice is built from your real experience." };
  }

  try {
    const out = await runTool(kind, { cvText: profile?.cv_text ?? null, storyBank: profile?.story_bank ?? null, role: role ?? null, draft });
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

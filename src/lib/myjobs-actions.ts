"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { isStage } from "@/lib/pipeline";

// Saves a role, or unsaves it if it's still only "saved". Returns whether it's now saved.
export async function toggleSave(roleId: number): Promise<boolean> {
  const { db, user } = await currentUser();
  if (!user) throw new Error("Sign in to save roles");
  const { data: existing } = await db.from("saved_roles").select("stage").eq("role_id", roleId).maybeSingle();
  if (existing) {
    if (existing.stage !== "saved") return true; // keep roles that are already in progress
    await db.from("saved_roles").delete().eq("role_id", roleId);
    revalidatePath("/", "layout");
    return false;
  }
  const { error } = await db.from("saved_roles").insert({ user_id: user.id, role_id: roleId });
  if (error) throw error;
  await db.from("application_events").insert({ user_id: user.id, role_id: roleId, stage: "saved" });
  revalidatePath("/", "layout");
  return true;
}

export async function setStage(roleId: number, stage: string): Promise<void> {
  if (!isStage(stage)) throw new Error("Unknown stage");
  const { db, user } = await currentUser();
  if (!user) throw new Error("Sign in first");
  const now = new Date().toISOString();
  const update: Record<string, string> = { stage, updated_at: now };
  if (stage === "applied") update.applied_at = now;
  const { error } = await db.from("saved_roles").update(update).eq("role_id", roleId);
  if (error) throw error;
  await db.from("application_events").insert({ user_id: user.id, role_id: roleId, stage });
  revalidatePath("/", "layout");
}

export async function saveStoryBank(text: string): Promise<void> {
  const { db, user } = await currentUser();
  if (!user) throw new Error("Sign in first");
  const { error } = await db.from("profiles").upsert({
    user_id: user.id,
    story_bank: text.slice(0, 20000),
    story_bank_updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  revalidatePath("/apply");
  revalidatePath("/my-jobs");
}

export async function removeSaved(roleId: number): Promise<void> {
  const { db, user } = await currentUser();
  if (!user) throw new Error("Sign in first");
  await db.from("saved_roles").delete().eq("role_id", roleId);
  revalidatePath("/", "layout");
}

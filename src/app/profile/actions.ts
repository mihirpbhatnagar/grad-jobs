"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { withDefaults, type ProfileAnswers } from "@/lib/profile";

export async function saveProfile(displayName: string, answers: ProfileAnswers): Promise<{ ok: boolean; error?: string }> {
  const { db, user } = await currentUser();
  if (!user) return { ok: false, error: "Sign in first" };
  const { error } = await db.from("profiles").upsert({
    user_id: user.id,
    display_name: displayName.trim().slice(0, 80) || null,
    answers: withDefaults(answers),
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

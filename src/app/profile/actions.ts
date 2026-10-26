"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { cvToText, suggestFields } from "@/lib/cv";
import { withDefaults, type ProfileAnswers } from "@/lib/profile";

export async function saveProfile(
  displayName: string,
  answers: ProfileAnswers,
  goalEmbedding: number[] | null,
): Promise<{ ok: boolean; error?: string }> {
  const { db, user } = await currentUser();
  if (!user) return { ok: false, error: "Sign in first" };
  const { error } = await db.from("profiles").upsert({
    user_id: user.id,
    display_name: displayName.trim().slice(0, 80) || null,
    answers: withDefaults(answers),
    ...(goalEmbedding?.length === 384 ? { goal_embedding: `[${goalEmbedding.map(Number).join(",")}]` } : {}),
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function recordCv(path: string, name: string): Promise<void> {
  const { db, user } = await currentUser();
  if (!user || !path.startsWith(`${user.id}/`)) throw new Error("Not allowed");

  // Read the CV's text (free, no AI) to suggest role types and for the later CV tools.
  let cvText = "";
  const { data: file } = await db.storage.from("cvs").download(path);
  if (file) {
    try {
      cvText = (await cvToText(await file.arrayBuffer(), name)).slice(0, 50000);
    } catch {
      cvText = "";
    }
  }

  const { error } = await db.from("profiles").upsert({
    user_id: user.id,
    cv_path: path,
    cv_name: name.slice(0, 120),
    cv_uploaded_at: new Date().toISOString(),
    cv_text: cvText || null,
    cv_suggested_fields: suggestFields(cvText),
  });
  if (error) throw error;
  revalidatePath("/profile");
}

// UK GDPR: removes the user's CV files, then the account (which cascades to all their rows).
export async function deleteAccount(): Promise<void> {
  const { db, user } = await currentUser();
  if (!user) redirect("/");
  const { data: files } = await db.storage.from("cvs").list(user.id);
  if (files?.length) await db.storage.from("cvs").remove(files.map((f) => `${user.id}/${f.name}`));
  const { error } = await db.rpc("delete_my_account");
  if (error) throw error;
  await db.auth.signOut();
  redirect("/");
}

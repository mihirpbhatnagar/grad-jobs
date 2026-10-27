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

export async function saveAlerts(alerts: { emailDigest: boolean; telegram: boolean }): Promise<void> {
  const { db, user } = await currentUser();
  if (!user) return;
  await db.from("profiles").upsert({ user_id: user.id, alerts: { emailDigest: !!alerts.emailDigest, telegram: !!alerts.telegram } });
}

// Links the user's Telegram chat: finds their "/start <code>" message to the bot.
export async function checkTelegram(): Promise<boolean> {
  const { db, user } = await currentUser();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!user || !token) return false;
  const { data: profile } = await db.from("profiles").select("telegram_link_code").maybeSingle();
  if (!profile?.telegram_link_code) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?allowed_updates=["message"]`, { cache: "no-store" });
  if (!res.ok) return false;
  const { result } = (await res.json()) as { result: { message?: { text?: string; chat: { id: number } } }[] };
  const hit = result.find((u) => u.message?.text?.trim() === `/start ${profile.telegram_link_code}`);
  if (!hit?.message) return false;
  const chatId = hit.message.chat.id;
  await db.from("profiles").update({ telegram_chat_id: chatId }).eq("user_id", user.id);
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: "Connected to Grad Jobs. Deadline reminders and new matches will arrive here each morning." }),
  });
  revalidatePath("/profile");
  return true;
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

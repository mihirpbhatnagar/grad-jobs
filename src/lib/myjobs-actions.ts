"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { isStage } from "@/lib/pipeline";

async function signedIn() {
  const { db, user } = await currentUser();
  if (!user) throw new Error("Sign in first");
  return { db, user };
}

// Saves a role, or unsaves it if it's still only "saved". Returns whether it's now saved.
export async function toggleSave(roleId: number): Promise<boolean> {
  const { db, user } = await signedIn();
  const { data: existing } = await db.from("saved_roles").select("id,stage").eq("role_id", roleId).maybeSingle();
  if (existing) {
    if (existing.stage !== "saved") return true; // keep roles that are already in progress
    await db.from("saved_roles").delete().eq("id", existing.id);
    revalidatePath("/", "layout");
    return false;
  }
  const { data, error } = await db.from("saved_roles").insert({ user_id: user.id, role_id: roleId }).select("id").single();
  if (error) throw error;
  await db.from("application_events").insert({ user_id: user.id, role_id: roleId, application_id: data.id, stage: "saved" });
  revalidatePath("/", "layout");
  return true;
}

export async function setStage(applicationId: number, stage: string): Promise<void> {
  if (!isStage(stage)) throw new Error("Unknown stage");
  const { db, user } = await signedIn();
  const now = new Date().toISOString();
  const { data: app } = await db.from("saved_roles").select("role_id,applied_at").eq("id", applicationId).single();
  const update: Record<string, string> = { stage, updated_at: now };
  if (stage === "applied" && !app?.applied_at) update.applied_at = now;
  const { error } = await db.from("saved_roles").update(update).eq("id", applicationId);
  if (error) throw error;
  await db.from("application_events").insert({ user_id: user.id, role_id: app?.role_id ?? null, application_id: applicationId, stage });
  revalidatePath("/", "layout");
}

export async function removeApplication(applicationId: number): Promise<void> {
  const { db, user } = await signedIn();
  const { data: files } = await db.storage.from("cvs").list(`${user.id}/applications/${applicationId}`);
  if (files?.length) await db.storage.from("cvs").remove(files.map((f) => `${user.id}/applications/${applicationId}/${f.name}`));
  await db.from("saved_roles").delete().eq("id", applicationId);
  revalidatePath("/", "layout");
}

// Dates the user can correct: when they applied, and (for roles added by hand) the closing date.
export async function setDates(applicationId: number, dates: { appliedOn?: string | null; closesOn?: string | null }): Promise<void> {
  const { db } = await signedIn();
  const valid = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const update: Record<string, string | null> = { updated_at: new Date().toISOString() };
  if ("appliedOn" in dates) update.applied_at = valid(dates.appliedOn) ? `${dates.appliedOn}T12:00:00Z` : null;
  if ("closesOn" in dates) update.closes_on = valid(dates.closesOn);
  const { error } = await db.from("saved_roles").update(update).eq("id", applicationId);
  if (error) throw error;
  revalidatePath("/", "layout");
}

export async function addUpdate(applicationId: number, note: string): Promise<void> {
  const text = note.trim().slice(0, 500);
  if (!text) return;
  const { db, user } = await signedIn();
  const { data: app } = await db.from("saved_roles").select("role_id").eq("id", applicationId).single();
  const { error } = await db.from("application_events").insert({ user_id: user.id, role_id: app?.role_id ?? null, application_id: applicationId, note: text });
  if (error) throw error;
  await db.from("saved_roles").update({ updated_at: new Date().toISOString() }).eq("id", applicationId);
  revalidatePath("/", "layout");
}

export async function deleteUpdate(eventId: number): Promise<void> {
  const { db } = await signedIn();
  await db.from("application_events").delete().eq("id", eventId).not("note", "is", null);
  revalidatePath("/", "layout");
}

// Records the CV or cover letter sent with an application (already uploaded to the user's
// own folder from the browser), or copies their profile CV when they used that one.
export async function recordDocument(applicationId: number, kind: "cv" | "cover", path: string | "profile", name: string): Promise<void> {
  const { db, user } = await signedIn();
  if (path === "profile") {
    const { data: profile } = await db.from("profiles").select("cv_path,cv_name").single();
    if (!profile?.cv_path) throw new Error("Upload a CV on your profile first");
    const copy = `${user.id}/applications/${applicationId}/cv-${Date.now()}-${profile.cv_name ?? "cv"}`;
    const { error } = await db.storage.from("cvs").copy(profile.cv_path, copy);
    if (error) throw error;
    path = copy;
    name = profile.cv_name ?? "CV";
  }
  if (!path.startsWith(`${user.id}/applications/${applicationId}/`)) throw new Error("Not allowed");
  const { data: app } = await db.from("saved_roles").select("cv_path,cover_path").eq("id", applicationId).single();
  const old = kind === "cv" ? app?.cv_path : app?.cover_path;
  if (old && old !== path) await db.storage.from("cvs").remove([old]);
  const update = kind === "cv" ? { cv_path: path, cv_name: name.slice(0, 120) } : { cover_path: path, cover_name: name.slice(0, 120) };
  const { error } = await db.from("saved_roles").update(update).eq("id", applicationId);
  if (error) throw error;
  revalidatePath("/", "layout");
}

// An application for a role that isn't in the app (found elsewhere, careers fair, etc.).
export async function addManualApplication(form: FormData): Promise<void> {
  const { db, user } = await signedIn();
  const company = String(form.get("company") ?? "").trim().slice(0, 120);
  const title = String(form.get("title") ?? "").trim().slice(0, 200);
  if (!company || !title) throw new Error("Add the company and role");
  const url = String(form.get("url") ?? "").trim();
  const stage = String(form.get("stage") ?? "applied");
  const appliedOn = String(form.get("appliedOn") ?? "");
  const closesOn = String(form.get("closesOn") ?? "");
  const day = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  const { data, error } = await db
    .from("saved_roles")
    .insert({
      user_id: user.id,
      company,
      title,
      url: /^https?:\/\//.test(url) ? url.slice(0, 500) : null,
      stage: isStage(stage) ? stage : "applied",
      applied_at: stage !== "saved" && stage !== "applying" ? (day(appliedOn) ? `${appliedOn}T12:00:00Z` : new Date().toISOString()) : null,
      closes_on: day(closesOn) ? closesOn : null,
    })
    .select("id,stage")
    .single();
  if (error) throw error;
  await db.from("application_events").insert({ user_id: user.id, application_id: data.id, stage: data.stage });
  revalidatePath("/", "layout");
  redirect(`/applications/${data.id}`);
}

export async function saveStoryBank(text: string): Promise<void> {
  const { db, user } = await signedIn();
  const { error } = await db.from("profiles").upsert({
    user_id: user.id,
    story_bank: text.slice(0, 20000),
    story_bank_updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  revalidatePath("/", "layout");
  revalidatePath("/my-jobs");
}

// Follows a company (or unfollows it). Returns whether it's now followed.
export async function toggleFollow(companyKey: string, name: string): Promise<boolean> {
  const { db, user } = await currentUser();
  if (!user) throw new Error("Sign in to follow companies");
  const { data: existing } = await db.from("follows").select("company_key").eq("company_key", companyKey).maybeSingle();
  if (existing) {
    await db.from("follows").delete().eq("company_key", companyKey);
    return false;
  }
  const { error } = await db.from("follows").insert({ user_id: user.id, company_key: companyKey, name: name.slice(0, 120) });
  if (error) throw error;
  return true;
}

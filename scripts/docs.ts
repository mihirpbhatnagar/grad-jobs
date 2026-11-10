// Link between Claude chats and the app, for CV and cover letter work. Run locally only
// (uses the secret key from .env.local). Works on one user's own data, found by email.
//
//   node scripts/docs.ts pull <email>                       CV text, story bank, applications
//   node scripts/docs.ts story <email> <file.txt>            replace the story bank
//   node scripts/docs.ts profile-cv <email> <file>           replace the main profile CV
//   node scripts/docs.ts new-app <email> <company> <title> [url]   add an application
//   node scripts/docs.ts attach <email> <appId> cv|cover <file>    save the CV / cover letter sent

import fs from "node:fs";
import path from "node:path";
import { adminClient, must } from "./lib/db.ts";
import { loadEnv } from "./lib/env.ts";

loadEnv();
const db = adminClient();
const BUCKET = "cvs";

const TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".txt": "text/plain",
};

async function userId(email: string): Promise<string> {
  for (let page = 1; page < 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 100) break;
  }
  throw new Error(`No app account for ${email}`);
}

async function upload(file: string, dest: string): Promise<void> {
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!type) throw new Error("Use a .pdf, .docx, .doc or .txt file");
  const { error } = await db.storage.from(BUCKET).upload(dest, fs.readFileSync(file), { contentType: type, upsert: true });
  if (error) throw new Error(error.message);
}

async function textOf(file: string): Promise<string> {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".txt") return fs.readFileSync(file, "utf8");
  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ buffer: fs.readFileSync(file) })).value;
  }
  if (ext === ".pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(file)));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  return "";
}

const safe = (name: string) => name.replace(/[^\w.\- ]+/g, "_");

const [cmd, email, ...rest] = process.argv.slice(2);
if (!cmd || !email) {
  console.log("Usage: see the top of scripts/docs.ts");
  process.exit(1);
}
const uid = await userId(email);

if (cmd === "pull") {
  const profile = await must(() => db.from("profiles").select("cv_name,cv_uploaded_at,cv_text,story_bank,story_bank_updated_at,answers").eq("user_id", uid).maybeSingle());
  const apps = await must(() =>
    db.from("saved_roles").select("id,role_id,stage,company,title,url,closes_on,applied_at,cv_name,cover_name,roles(title,employer,apply_url,expires_at)").eq("user_id", uid).order("id"),
  );
  console.log(JSON.stringify({ profile, applications: apps }, null, 2));
} else if (cmd === "story") {
  const text = fs.readFileSync(rest[0], "utf8").slice(0, 100000);
  await must(() => db.from("profiles").upsert({ user_id: uid, story_bank: text, story_bank_updated_at: new Date().toISOString() }).select("user_id"));
  console.log("Story bank saved");
} else if (cmd === "profile-cv") {
  const file = rest[0];
  const dest = `${uid}/cv-${Date.now()}-${safe(path.basename(file))}`;
  const old = await must(() => db.from("profiles").select("cv_path").eq("user_id", uid).maybeSingle());
  await upload(file, dest);
  const cvText = (await textOf(file)).slice(0, 50000);
  await must(() =>
    db.from("profiles").upsert({ user_id: uid, cv_path: dest, cv_name: path.basename(file).slice(0, 120), cv_uploaded_at: new Date().toISOString(), cv_text: cvText || null }).select("user_id"),
  );
  if (old?.cv_path && old.cv_path !== dest) await db.storage.from(BUCKET).remove([old.cv_path]);
  console.log(`Profile CV replaced (${cvText.length} characters of text read)`);
} else if (cmd === "new-app") {
  const [company, title, url] = rest;
  if (!company || !title) throw new Error("Give company and title");
  const row = await must(() =>
    db.from("saved_roles").insert({ user_id: uid, company, title, url: url || null }).select("id").single(),
  );
  console.log(`Application added: id ${(row as { id: number }).id}`);
} else if (cmd === "attach") {
  const [appId, kind, file] = rest;
  if (kind !== "cv" && kind !== "cover") throw new Error("Kind must be cv or cover");
  const app = await must(() => db.from("saved_roles").select("id,cv_path,cover_path").eq("user_id", uid).eq("id", Number(appId)).single()) as { cv_path: string | null; cover_path: string | null };
  const dest = `${uid}/applications/${appId}/${kind}-${Date.now()}-${safe(path.basename(file))}`;
  await upload(file, dest);
  const old = kind === "cv" ? app.cv_path : app.cover_path;
  const name = path.basename(file).slice(0, 120);
  const update = kind === "cv" ? { cv_path: dest, cv_name: name } : { cover_path: dest, cover_name: name };
  await must(() => db.from("saved_roles").update({ ...update, updated_at: new Date().toISOString() }).eq("id", Number(appId)).select("id"));
  if (old && old !== dest) await db.storage.from(BUCKET).remove([old]);
  console.log(`Saved ${kind === "cv" ? "CV" : "cover letter"} to application ${appId}`);
} else {
  throw new Error(`Unknown command ${cmd}`);
}

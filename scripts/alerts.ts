// Alerts, run straight after the daily data job (GitHub Actions) or with `npm run alerts`.
// For each user: new For you matches, deadline countdowns (7, 3, 1 days and closing day) for
// saved roles, closed-role warnings, a nudge 14 days after saving a role with no deadline, and
// new roles from followed companies.
// Sent as one Telegram message (if connected) and one email digest (if switched on).
// Needs TELEGRAM_BOT_TOKEN and/or RESEND_API_KEY; without them it reports and does nothing.

import { adminClient, must, selectAll } from "./lib/db.ts";
import { loadEnv } from "./lib/env.ts";
import { rankForYou } from "../src/lib/matching.ts";
import { withDefaults } from "../src/lib/profile.ts";
import type { Role } from "../src/lib/roles.ts";

loadEnv();
const db = adminClient();
const APP = process.env.APP_URL ?? "https://grad-jobs-six.vercel.app";
const TELEGRAM = process.env.TELEGRAM_BOT_TOKEN;
const RESEND = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM ?? "Grad Jobs <onboarding@resend.dev>";
const dryRun = process.argv.includes("--dry-run");

type Profile = { user_id: string; display_name: string | null; answers: unknown; goal_embedding: string | null; telegram_chat_id: number | null; alerts: { emailDigest?: boolean; telegram?: boolean }; last_digest_at: string | null };
type Saved = { user_id: string; role_id: number; stage: string; saved_at: string };
type RoleRow = Role & { description: string | null; is_open: boolean; first_seen: string };
type Item = { roleId: number; kind: string; text: string };

const COLS = "id,title,employer,location,locations,salary_min,salary_max,apply_url,posted_at,expires_at,tags,sponsor_status,sponsor_name,sources,start_status,company_key,description,is_open,first_seen";
const daysLeft = (iso: string) => Math.round((new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime() - new Date(new Date().toISOString().slice(0, 10)).getTime()) / 86_400_000);
const link = (id: number) => `${APP}/roles/${id}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function telegram(chatId: number, html: string) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (!res.ok) console.warn(`Telegram send failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

async function email(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) console.warn(`Email to ${to.replace(/(.).+@/, "$1…@")} failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

function section(title: string, items: Item[], roles: Map<number, RoleRow>, asHtmlEmail: boolean): string {
  if (!items.length) return "";
  const lines = items.map((i) => {
    const r = roles.get(i.roleId)!;
    return asHtmlEmail
      ? `<li style="margin:6px 0"><a href="${link(r.id)}" style="color:#4f46e5;font-weight:600;text-decoration:none">${esc(r.title)}</a> · ${esc(r.employer)}<br><span style="color:#5f6b7d">${esc(i.text)}</span></li>`
      : `• <a href="${link(r.id)}">${esc(r.title)}</a> · ${esc(r.employer)}\n   ${esc(i.text)}`;
  });
  return asHtmlEmail ? `<h3 style="margin:18px 0 6px;font-size:15px">${title}</h3><ul style="padding-left:18px;margin:0">${lines.join("")}</ul>` : `<b>${title}</b>\n${lines.join("\n")}`;
}

async function main() {
  if (!TELEGRAM && !RESEND) {
    console.log("No TELEGRAM_BOT_TOKEN or RESEND_API_KEY set: alerts are built but switched off.");
    return;
  }
  const profiles = await selectAll<Profile>((from, to) => db.from("profiles").select("user_id,display_name,answers,goal_embedding,telegram_chat_id,alerts,last_digest_at").order("user_id").range(from, to));
  const saved = await selectAll<Saved>((from, to) => db.from("saved_roles").select("user_id,role_id,stage,saved_at").order("user_id").range(from, to));
  const sent = await selectAll<{ user_id: string; role_id: number; kind: string }>((from, to) => db.from("alerts_sent").select("user_id,role_id,kind").order("user_id").range(from, to));
  const already = new Set(sent.map((s) => `${s.user_id}|${s.role_id}|${s.kind}`));
  const follows = await selectAll<{ user_id: string; company_key: string }>((from, to) => db.from("follows").select("user_id,company_key").order("user_id").range(from, to));

  // Main-list roles (for new matches) and every saved role (open or not).
  const today = new Date().toISOString().slice(0, 10);
  const open = await selectAll<RoleRow>((from, to) =>
    db.from("roles").select(COLS).eq("is_open", true).eq("kind", "job").eq("part_time", false).in("start_status", ["confirmed", "likely"]).or(`expires_at.is.null,expires_at.gte.${today}`).order("id").range(from, to),
  );
  const savedIds = [...new Set(saved.map((s) => s.role_id))];
  const savedRoles: RoleRow[] = [];
  for (let i = 0; i < savedIds.length; i += 200) savedRoles.push(...((await must(() => db.from("roles").select(COLS).in("id", savedIds.slice(i, i + 200)))) as RoleRow[]));
  const roles = new Map([...open, ...savedRoles].map((r) => [r.id, r]));
  const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
  const emailOf = new Map((users?.users ?? []).map((u) => [u.id, u.email]));

  let messages = 0;
  for (const p of profiles) {
    const answers = withDefaults(p.answers as never);
    const mine = saved.filter((s) => s.user_id === p.user_id);
    const deadlines: Item[] = [];
    const closed: Item[] = [];
    const nudges: Item[] = [];
    for (const s of mine) {
      const r = roles.get(s.role_id);
      if (!r || ["applied", "test", "interview", "assessment_centre", "offer", "rejected"].includes(s.stage)) continue;
      const deadline = r.tags.deadline ?? r.expires_at;
      if (!r.is_open || (deadline && daysLeft(deadline) < 0)) {
        closed.push({ roleId: r.id, kind: "closed", text: "This listing has disappeared or passed its deadline. Check the employer's site." });
        continue;
      }
      if (deadline) {
        const d = daysLeft(deadline);
        const mark = d === 0 ? "deadline_0" : d === 1 ? "deadline_1" : d <= 3 ? "deadline_3" : d <= 7 ? "deadline_7" : null;
        if (mark) deadlines.push({ roleId: r.id, kind: mark, text: d === 0 ? "Closes today" : `Closes in ${d} day${d === 1 ? "" : "s"}` });
      } else if ((Date.now() - new Date(s.saved_at).getTime()) / 86_400_000 >= 14) {
        nudges.push({ roleId: r.id, kind: "rolling_nudge", text: "No closing date, so it may close when filled. You saved it two weeks ago: apply soon." });
      }
    }

    // New For you matches since the last digest (or the last day for a first digest).
    const since = p.last_digest_at ?? new Date(Date.now() - 86_400_000).toISOString();
    const similarity = new Map<number, number>();
    if (p.goal_embedding) {
      const { data } = await db.rpc("match_roles", { query: p.goal_embedding, max_results: 1000 });
      for (const c of (data ?? []) as { id: number; similarity: number }[]) similarity.set(c.id, c.similarity);
    }
    const fresh = answers.fields.value.length ? rankForYou(open.filter((r) => r.first_seen > since), answers, similarity).slice(0, 8) : [];
    const matches: Item[] = fresh.map((m) => ({ roleId: m.role.id, kind: "new_match", text: m.tags.join(" · ") }));

    // New roles (any kind, including internships) from companies the user follows.
    const followed = new Set(follows.filter((f) => f.user_id === p.user_id).map((f) => f.company_key));
    const fromFollowed: Item[] = followed.size
      ? ((await must(() =>
          db.from("roles").select(COLS).eq("is_open", true).in("company_key", [...followed]).gt("first_seen", since).limit(30),
        )) as RoleRow[]).map((r) => {
          roles.set(r.id, r);
          return { roleId: r.id, kind: "followed_company", text: "New from a company you follow" };
        })
      : [];

    const notYet = (i: Item) => !already.has(`${p.user_id}|${i.roleId}|${i.kind}`);
    const parts = { deadlines: deadlines.filter(notYet), closed: closed.filter(notYet), nudges: nudges.filter(notYet), followed: fromFollowed.filter(notYet), matches: matches.filter((m) => notYet(m) && !fromFollowed.some((f) => f.roleId === m.roleId)) };
    const all = [...parts.deadlines, ...parts.closed, ...parts.nudges, ...parts.followed, ...parts.matches];
    if (!all.length) continue;

    const name = p.display_name?.split(" ")[0];
    const blocks = (html: boolean) =>
      [
        section("⏰ Deadlines", parts.deadlines, roles, html),
        section("⚠️ May have closed", parts.closed, roles, html),
        section("👉 Apply soon", parts.nudges, roles, html),
        section("🏢 Companies you follow", parts.followed, roles, html),
        section("✦ New for you", parts.matches, roles, html),
      ].filter(Boolean);

    if (dryRun) {
      console.log(`[dry run] ${p.user_id.slice(0, 8)}: ${all.length} alerts`);
      continue;
    }
    if (TELEGRAM && p.telegram_chat_id && p.alerts?.telegram !== false) {
      await telegram(p.telegram_chat_id, `${name ? `Morning ${esc(name)}! ` : ""}Here's your Grad Jobs update.\n\n${blocks(false).join("\n\n")}`);
      messages++;
    }
    const to = emailOf.get(p.user_id);
    if (RESEND && to && p.alerts?.emailDigest !== false) {
      const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#0f1729"><h2 style="margin:0 0 4px">Your Grad Jobs digest</h2><p style="color:#5f6b7d;margin:0">${name ? `Morning ${esc(name)}. ` : ""}Today's deadlines, matches and changes.</p>${blocks(true).join("")}<p style="margin-top:24px"><a href="${APP}/my-jobs" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:600">Open My jobs</a></p><p style="color:#96a0b3;font-size:12px">Turn this off on your profile page.</p></div>`;
      await email(to, parts.deadlines.length ? `⏰ ${parts.deadlines.length} deadline${parts.deadlines.length === 1 ? "" : "s"} coming up` : `✦ ${parts.matches.length} new roles for you`, html);
      messages++;
    }
    const rows = all.map((i) => ({ user_id: p.user_id, role_id: i.roleId, kind: i.kind }));
    await must(() => db.from("alerts_sent").upsert(rows, { onConflict: "user_id,role_id,kind", ignoreDuplicates: true }));
    await must(() => db.from("profiles").update({ last_digest_at: new Date().toISOString() }).eq("user_id", p.user_id));
  }
  console.log(`Alerts: ${messages} messages sent to ${profiles.length} users checked`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

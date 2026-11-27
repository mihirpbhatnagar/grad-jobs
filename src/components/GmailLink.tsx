import { connection } from "next/server";
import { currentUser } from "@/lib/auth";
import { CheckInboxNow, InboxAutoSync } from "@/components/InboxSync";
import { gmailAvailable } from "@/lib/gmail";
import { dismissGmailQuestion, unlinkGmail } from "@/lib/gmail-actions";

const WHAT_IT_DOES = "Replies from employers you've applied to (test invites, interviews, rejections, offers) update your applications on their own. Nothing else in your inbox is read or kept, and you can unlink any time.";

const GmailIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
    <path fill="#4285F4" d="M2 6.5V18a1.5 1.5 0 0 0 1.5 1.5H7v-8.4L2 6.5z" />
    <path fill="#34A853" d="M17 19.5h3.5A1.5 1.5 0 0 0 22 18V6.5l-5 4.6v8.4z" />
    <path fill="#EA4335" d="M7 11.1V5.5l5 3.8 5-3.8v5.6l-5 3.7-5-3.7z" />
    <path fill="#FBBC05" d="M17 5.5v5.6l5-4.6V5.2c0-1.3-1.5-2-2.5-1.2L17 5.5z" />
    <path fill="#C5221F" d="M7 5.5v5.6L2 6.5V5.2C2 3.9 3.5 3.2 4.5 4L7 5.5z" />
  </svg>
);

// Asked once, after first sign-in: "Link your Gmail?"
export async function GmailQuestion() {
  await connection();
  if (!gmailAvailable()) return null;
  const { db, user } = await currentUser();
  if (!user) return null;
  const [{ data: profile }, { data: link }] = await Promise.all([
    db.from("profiles").select("gmail_asked_at").maybeSingle(),
    db.from("gmail_links").select("user_id").maybeSingle(),
  ]);
  if (link) return <InboxAutoSync />;
  if (profile?.gmail_asked_at) return null;
  return (
    <section className="rounded-xl border-2 border-accent/25 bg-surface p-5">
      <h2 className="flex items-center gap-2 font-semibold tracking-tight">
        <GmailIcon />
        Link your Gmail so applications update themselves?
      </h2>
      <p className="mt-2 text-sm text-muted">{WHAT_IT_DOES}</p>
      <p className="mt-2 text-xs text-muted">
        Google will show &quot;Google hasn&apos;t verified this app&quot;: tap Advanced, then Go to Grad Jobs. It&apos;s a private app for a few friends.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href="/api/gmail/start" className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90">
          Link Gmail (read-only)
        </a>
        <form action={dismissGmailQuestion}>
          <button type="submit" className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground">
            Not now
          </button>
        </form>
      </div>
    </section>
  );
}

const RESULT: Record<string, { text: string; good: boolean }> = {
  linked: { text: "Gmail linked.", good: true },
  cancelled: { text: "Gmail wasn't linked.", good: false },
  "no-permission": { text: "Gmail wasn't linked: tick the box to let Grad Jobs read your email on Google's screen.", good: false },
  failed: { text: "Something went wrong linking Gmail. Try again.", good: false },
};

// Profile page: link or unlink Gmail any time.
export async function GmailSection({ result }: { result?: string }) {
  if (!gmailAvailable()) return null;
  const { db } = await currentUser();
  const { data: link } = await db.from("gmail_links").select("email,linked_at,last_synced_at").maybeSingle();
  const message = result ? RESULT[result] : undefined;
  return (
    <section id="gmail" className="rounded-xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 font-semibold tracking-tight">
        <GmailIcon />
        Gmail
      </h2>
      <p className="mt-1 text-sm text-muted">{WHAT_IT_DOES}</p>
      {message && <p className={`mt-3 rounded-lg px-4 py-2.5 text-sm ${message.good ? "bg-success-soft text-success" : "bg-rose-soft text-rose"}`}>{message.text}</p>}
      {link ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm">
            Linked to <span className="font-semibold">{link.email}</span>
            <span className="block text-xs text-muted">
              {link.last_synced_at ? `Last checked ${new Date(link.last_synced_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Checked each time you open My jobs"}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <CheckInboxNow />
            <form action={unlinkGmail}>
            <button type="submit" className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-rose">
              Unlink
            </button>
            </form>
          </span>
        </div>
      ) : (
        <a href="/api/gmail/start" className="mt-4 inline-flex rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90">
          Link Gmail (read-only)
        </a>
      )}
    </section>
  );
}

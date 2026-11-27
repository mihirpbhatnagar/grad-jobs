import Link from "next/link";
import { Suspense } from "react";
import { GmailSection } from "@/components/GmailLink";
import { StoryBankSection } from "@/components/StoryBankSection";
import { currentUser, requireUser } from "@/lib/auth";
import { withDefaults } from "@/lib/profile";
import { signOut } from "../sign-in/actions";
import { Alerts } from "./Alerts";
import { CvUpload } from "./CvUpload";
import { DeleteAccount } from "./DeleteAccount";
import { ProfileForm } from "./ProfileForm";

// At-cost AI spend for this user (exact tokens logged per request), USD as on the Anthropic
// Console plus approximate GBP.
async function AiSpend() {
  const { db } = await currentUser();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const { data } = await db.from("ai_outputs").select("cost_usd,created_at");
  const all = (data ?? []).reduce((n, r) => n + Number(r.cost_usd), 0);
  const month = (data ?? []).filter((r) => r.created_at >= monthStart).reduce((n, r) => n + Number(r.cost_usd), 0);
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="font-semibold tracking-tight">Your AI costs</h2>
      <p className="mt-1 text-sm text-muted">Apply tools are charged at cost, from the exact tokens each request used.</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-chip px-3 py-2">
          <div className="text-xs text-muted">This month</div>
          <div className="font-semibold">${month.toFixed(2)} <span className="text-xs font-normal text-muted">≈ £{(month * 0.79).toFixed(2)}</span></div>
        </div>
        <div className="rounded-lg bg-chip px-3 py-2">
          <div className="text-xs text-muted">All time ({data?.length ?? 0} requests)</div>
          <div className="font-semibold">${all.toFixed(2)} <span className="text-xs font-normal text-muted">≈ £{(all * 0.79).toFixed(2)}</span></div>
        </div>
      </div>
    </section>
  );
}

async function Profile({ searchParams }: { searchParams: PageProps<"/profile">["searchParams"] }) {
  const { gmail } = await searchParams;
  const { db, user } = await requireUser("/profile");
  const { data } = await db.from("profiles").select("display_name,answers,cv_name,cv_uploaded_at,cv_suggested_fields,telegram_link_code,telegram_chat_id,alerts").maybeSingle();
  const cv = (
    <CvUpload
      url={process.env.SUPABASE_URL!}
      publishableKey={process.env.SUPABASE_PUBLISHABLE_KEY!}
      userId={user.id}
      current={data?.cv_name && data.cv_uploaded_at ? { name: data.cv_name, uploadedAt: data.cv_uploaded_at } : null}
    />
  );
  return (
    <div className="space-y-4">
      <ProfileForm initialName={data?.display_name ?? ""} initial={withDefaults(data?.answers)} email={user.email ?? ""} cvSlot={cv} cvSuggestions={data?.cv_suggested_fields ?? []} />
      {data?.telegram_link_code && (
        <Alerts
          initial={{ emailDigest: data.alerts?.emailDigest !== false, telegram: data.alerts?.telegram !== false }}
          connected={!!data.telegram_chat_id}
          botUsername={process.env.TELEGRAM_BOT_USERNAME ?? null}
          linkCode={data.telegram_link_code}
        />
      )}
      <StoryBankSection />
      <GmailSection result={typeof gmail === "string" ? gmail : undefined} />
      <AiSpend />
      <Link href="/admin" className="card-lift flex items-center justify-between rounded-xl border border-border bg-surface p-5">
        <span>
          <span className="font-semibold tracking-tight">Data coverage</span>
          <span className="block text-sm text-muted">How many UK graduate roles the app is catching, checked every morning</span>
        </span>
        <span aria-hidden className="text-muted">→</span>
      </Link>
      <DeleteAccount />
    </div>
  );
}

export default function ProfilePage(props: PageProps<"/profile">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your profile</h1>
          <p className="mt-2 text-muted">Everything that shapes For you, editable any time.</p>
        </div>
        <form action={signOut}>
          <button type="submit" className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground">
            Sign out
          </button>
        </form>
      </div>
      <div className="mt-8">
        <Suspense fallback={<div className="h-[70vh] animate-pulse rounded-xl bg-chip" />}>
          <Profile searchParams={props.searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

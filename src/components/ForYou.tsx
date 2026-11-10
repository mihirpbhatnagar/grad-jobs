import { cacheLife } from "next/cache";
import Link from "next/link";
import { RoleCard } from "@/components/RoleCard";
import { currentUser } from "@/lib/auth";
import { companiesFor } from "@/lib/companies";
import { forYouShortlist, type Shortlist } from "@/lib/forYouRoles";
import { rankForYou } from "@/lib/matching";
import { withDefaults } from "@/lib/profile";
import { ROLE_COLUMNS, type Role } from "@/lib/roles";
import { publicClient } from "@/lib/supabase";
import { visaSettings } from "@/lib/visa";

const SHOW = 30;

// The shortlist only changes when the profile or the daily data does, so it is kept for a few
// minutes: saving a role or coming back to the page doesn't work it all out again.
async function shortlistFor(answersJson: string, goalEmbedding: string | null): Promise<Shortlist> {
  "use cache";
  cacheLife("minutes");
  return forYouShortlist(publicClient()!, JSON.parse(answersJson), goalEmbedding);
}

function Prompt({ title, body, href, cta }: { title: string; body: string; href: string; cta: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-8 text-center">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-muted">{body}</p>
      <Link href={href} className="mt-5 inline-flex rounded-xl bg-foreground px-5 py-2.5 text-sm font-medium text-background">
        {cta}
      </Link>
    </div>
  );
}

// Roles ranked against the signed-in user's profile answers.
export async function ForYou() {
  const { db, user } = await currentUser();
  if (!user) {
    return <Prompt title="Roles picked for you" body="Sign in and tell us what you're looking for. We'll rank every 2027 role for you." href="/sign-in?next=/my-jobs" cta="Sign in" />;
  }
  const { data: profile } = await db.from("profiles").select("answers,goal_embedding").maybeSingle();
  const answers = withDefaults(profile?.answers);
  if (answers.fields.value.length === 0) {
    return <Prompt title="Tell us what you're looking for" body="Pick the kinds of roles you want on your profile and For you will fill up with matches." href="/profile" cta="Set up your profile" />;
  }

  // Step 1: the best matches on everything except the description (see lib/forYouRoles.ts).
  const shortlist = await shortlistFor(JSON.stringify(answers), profile?.goal_embedding ? String(profile.goal_embedding) : null);
  // Step 2: those few in full, ranked again with their descriptions.
  const pub = publicClient()!;
  const [{ data }, visa, { data: saved }] = await Promise.all([
    shortlist.ids.length ? pub.from("roles").select(`${ROLE_COLUMNS},description`).in("id", shortlist.ids).eq("is_open", true) : Promise.resolve({ data: [] }),
    visaSettings(),
    db.from("saved_roles").select("role_id"),
  ]);
  const matches = rankForYou((data ?? []) as unknown as (Role & { description: string | null; last_seen: string | null })[], answers, new Map(shortlist.similarity));
  const total = Math.max(shortlist.total, matches.length);

  const shown = matches.slice(0, SHOW);
  const companies = await companiesFor(shown.map((m) => m.role.company_key));
  const savedIds = new Set((saved ?? []).map((s) => s.role_id));

  if (matches.length === 0) {
    return <Prompt title="No matches yet" body="Nothing matches your profile today. Try ticking more fields, or check All roles." href="/profile" cta="Edit profile" />;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {total.toLocaleString("en-GB")} role{total === 1 ? "" : "s"} match your profile. Best matches first.
      </p>
      {shown.map((m) => (
        <RoleCard
          key={m.role.id}
          role={m.role}
          company={m.role.company_key ? companies.get(m.role.company_key) : null}
          saved={savedIds.has(m.role.id)}
          signedIn
          matchTags={m.tags}
          visa={visa}
        />
      ))}
    </div>
  );
}

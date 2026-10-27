import Link from "next/link";
import { RoleCard } from "@/components/RoleCard";
import { currentUser } from "@/lib/auth";
import { companiesFor } from "@/lib/companies";
import { rankForYou } from "@/lib/matching";
import { withDefaults } from "@/lib/profile";
import { ROLE_COLUMNS, type Role } from "@/lib/roles";
import { estimateFor, salaryContext } from "@/lib/salary";
import { publicClient } from "@/lib/supabase";

const SHOW = 30;

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

  const pub = publicClient()!;
  const { data } = await pub
    .from("roles")
    .select(`${ROLE_COLUMNS},description`)
    .eq("is_open", true)
    .eq("kind", "job")
    .eq("part_time", false)
    .in("start_status", ["confirmed", "likely"])
    .limit(1000);
  const similarity = new Map<number, number>();
  if (profile?.goal_embedding) {
    const { data: close } = await pub.rpc("match_roles", { query: profile.goal_embedding, max_results: 1000 });
    for (const c of (close ?? []) as { id: number; similarity: number }[]) similarity.set(c.id, c.similarity);
  }
  const matches = rankForYou((data ?? []) as (Role & { description: string | null })[], answers, similarity);

  const shown = matches.slice(0, SHOW);
  const [companies, ctx] = await Promise.all([companiesFor(shown.map((m) => m.role.company_key)), salaryContext()]);
  const { data: saved } = await db.from("saved_roles").select("role_id");
  const savedIds = new Set((saved ?? []).map((s) => s.role_id));

  if (matches.length === 0) {
    return <Prompt title="No matches yet" body="Nothing matches your profile today. Try ticking more fields, or check All roles." href="/profile" cta="Edit profile" />;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {matches.length} role{matches.length === 1 ? "" : "s"} match your profile. Best matches first.
      </p>
      {shown.map((m) => (
        <RoleCard
          key={m.role.id}
          role={m.role}
          company={m.role.company_key ? companies.get(m.role.company_key) : null}
          estimate={m.role.salary_min || m.role.salary_max ? null : estimateFor(m.role.title, ctx)?.amount}
          saved={savedIds.has(m.role.id)}
          signedIn
          matchTags={m.tags}
        />
      ))}
    </div>
  );
}

import { currentUser } from "@/lib/auth";
import { contactsFromDescription, fieldLinks, networkingLinks } from "@/lib/contacts";
import { isBoardName } from "@/lib/format";
import { FIELDS, withDefaults } from "@/lib/profile";

const LINK_ICON = (
  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M8 4H4v12h12v-4M11 4h5v5M16 4l-7 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function LinkRow({ label, detail, href }: { label: string; detail?: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-start justify-between gap-3 rounded-xl px-2 py-2 hover:bg-chip">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {detail && <span className="block text-xs text-muted">{detail}</span>}
      </span>
      <span className="mt-0.5 text-muted">{LINK_ICON}</span>
    </a>
  );
}

// Role page: who to contact about this role.
export function RoleContacts({ employer, description }: { employer: string; description: string | null }) {
  const stated = contactsFromDescription(description);
  const links = isBoardName(employer) ? [] : networkingLinks(employer);
  if (!stated.length && !links.length) return null;
  return (
    <div className="space-y-3">
      {stated.length > 0 && (
        <ul className="space-y-1">
          {stated.map((c) => (
            <li key={c.label}>
              {c.href ? (
                <LinkRow label={c.label} detail={c.detail} href={c.href} />
              ) : (
                <div className="px-2 py-2">
                  <span className="block text-sm font-medium">{c.label}</span>
                  <span className="block text-xs text-muted">{c.detail}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {links.length > 0 && (
        <div>
          {stated.length > 0 && <p className="px-2 pt-1 text-xs font-semibold uppercase tracking-wider text-muted">On LinkedIn</p>}
          {links.map((l) => <LinkRow key={l.label} {...l} />)}
        </div>
      )}
      <p className="px-2 text-xs text-muted">LinkedIn opens in your own account. Keep the first message short: who you are, why them, one question.</p>
    </div>
  );
}

// My jobs: people worth messaging, for the companies the user has saved and their fields.
export async function PeopleToReachOut() {
  const { db, user } = await currentUser();
  if (!user) return null;
  const [{ data: saved }, { data: profile }] = await Promise.all([
    db.from("saved_roles").select("role:roles(employer)").order("saved_at", { ascending: false }).limit(40),
    db.from("profiles").select("answers").maybeSingle(),
  ]);
  const companies = [
    ...new Set(
      ((saved ?? []) as unknown as { role: { employer: string } | null }[]).map((s) => s.role?.employer).filter((e): e is string => !!e && !isBoardName(e)),
    ),
  ].slice(0, 6);
  const fields = FIELDS.filter((f) => withDefaults(profile?.answers).fields.value.includes(f.id)).slice(0, 3);

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="font-semibold tracking-tight">People to reach out to</h2>
      <p className="mt-1 text-sm text-muted">Loughborough alumni and recent graduates: the people most likely to reply.</p>
      {companies.length === 0 && fields.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Save a few roles or add fields to your profile and contacts for those companies will appear here.</p>
      ) : (
        <div className="mt-3 space-y-1">
          {companies.map((c) => {
            const [alumni] = networkingLinks(c);
            return <LinkRow key={c} label={alumni.label} detail="From your saved roles" href={alumni.href} />;
          })}
          {fields.map((f) => {
            const l = fieldLinks(f.label);
            return <LinkRow key={f.id} label={l.label} detail="From your profile fields" href={l.href} />;
          })}
        </div>
      )}
    </section>
  );
}

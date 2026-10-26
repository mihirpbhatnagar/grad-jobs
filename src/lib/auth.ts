import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Supabase client acting as the signed-in user (session kept in cookies), so row-level
// security limits it to that user's own profile, saved roles and applications.
export async function userClient() {
  const store = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Server components can't set cookies; the proxy refreshes the session instead.
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {}
      },
    },
  });
}

export async function currentUser() {
  const db = await userClient();
  const { data } = await db.auth.getUser();
  return { db, user: data.user };
}

// For pages that only make sense signed in: sends visitors to sign in, then back here.
export async function requireUser(next: string) {
  const session = await currentUser();
  if (!session.user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return { db: session.db, user: session.user };
}

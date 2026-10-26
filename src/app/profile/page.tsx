import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { withDefaults } from "@/lib/profile";
import { signOut } from "../sign-in/actions";
import { ProfileForm } from "./ProfileForm";

async function Profile() {
  const { db, user } = await requireUser("/profile");
  const { data } = await db.from("profiles").select("display_name,answers").maybeSingle();
  return <ProfileForm initialName={data?.display_name ?? ""} initial={withDefaults(data?.answers)} email={user.email ?? ""} />;
}

export default function ProfilePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your profile</h1>
          <p className="mt-2 text-muted">Everything that shapes For you, editable any time.</p>
        </div>
        <form action={signOut}>
          <button type="submit" className="rounded-xl border border-border px-4 py-2 text-sm text-muted hover:text-foreground">
            Sign out
          </button>
        </form>
      </div>
      <div className="mt-8">
        <Suspense fallback={<div className="h-[70vh] animate-pulse rounded-2xl bg-chip" />}>
          <Profile />
        </Suspense>
      </div>
    </main>
  );
}

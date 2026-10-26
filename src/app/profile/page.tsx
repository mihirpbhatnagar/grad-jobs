import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { withDefaults } from "@/lib/profile";
import { signOut } from "../sign-in/actions";
import { CvUpload } from "./CvUpload";
import { DeleteAccount } from "./DeleteAccount";
import { ProfileForm } from "./ProfileForm";

async function Profile() {
  const { db, user } = await requireUser("/profile");
  const { data } = await db.from("profiles").select("display_name,answers,cv_name,cv_uploaded_at,cv_suggested_fields").maybeSingle();
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
      <DeleteAccount />
    </div>
  );
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

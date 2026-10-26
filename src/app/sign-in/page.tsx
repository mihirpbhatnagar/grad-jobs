import { Suspense } from "react";
import { SignInForm } from "./SignInForm";

async function Form({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const params = await searchParams;
  const next = typeof params.next === "string" && params.next.startsWith("/") ? params.next : "/my-jobs";
  return <SignInForm next={next} confirmed={params.confirmed === "1"} />;
}

export default function SignInPage(props: PageProps<"/sign-in">) {
  return (
    <main className="mx-auto w-full max-w-md px-4 pb-24 pt-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Welcome</h1>
      <p className="mt-2 text-muted">Your saved roles, applications and profile are private to your account.</p>
      <div className="mt-8">
        <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-chip" />}>
          <Form searchParams={props.searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

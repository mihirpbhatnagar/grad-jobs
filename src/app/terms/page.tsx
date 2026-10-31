import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms · Grad Jobs" };

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-4 pb-24 pt-8 leading-7 text-foreground/85 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Terms</h1>
      <p className="text-sm text-muted">Last updated 31 October 2026</p>
      <p>Grad Jobs is a private, non-commercial tool for a small invited group. By using it you agree to these short terms.</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Role listings come from public sources and employers&apos; own sites. Always check the details on the employer&apos;s listing before applying.</li>
        <li>Visa and salary information is a guide, not legal advice. Check GOV.UK or an adviser for your situation.</li>
        <li>The app never applies, sends or submits anything for you. AI tools suggest edits to your own writing; you decide what to use.</li>
        <li>Keep your sign-in to yourself. You can delete your account and data at any time on your profile.</li>
        <li>The app is provided as is, with no guarantee it catches every role.</li>
      </ul>
      <p>
        See also the <a className="text-accent underline" href="/privacy">privacy page</a>.
      </p>
    </main>
  );
}

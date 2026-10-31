import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy · Grad Jobs" };

const H = ({ children }: { children: React.ReactNode }) => <h2 className="mt-8 text-lg font-semibold tracking-tight">{children}</h2>;

// Plain-English privacy policy (UK GDPR), also linked from Google's sign-in and Gmail screens.
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-8 leading-7 text-foreground/85 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Privacy</h1>
      <p className="mt-2 text-sm text-muted">Last updated 31 October 2026</p>
      <p className="mt-6">
        Grad Jobs is a private, non-commercial app run by Mihir Bhatnagar for a small group of friends looking for UK graduate roles. This page says what it keeps
        about you and why.
      </p>

      <H>What we keep</H>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Your email address and sign-in (email and password, or Google sign-in: your name and email only).</li>
        <li>Your profile answers, the CV you upload, your story bank notes, saved roles and applications, and the CVs and cover letters you choose to attach to them.</li>
        <li>If you link Gmail: an encrypted permission token, and the subject line and date of emails from employers you&apos;ve applied to, and what stage they mean (like an interview invite). Email bodies are never stored.</li>
      </ul>

      <H>Gmail (optional, read-only)</H>
      <p className="mt-2">
        Linking Gmail is optional and you can unlink it any time on your profile, which also cancels the permission with Google. The app asks for read-only access
        and only looks at emails from employers and hiring systems you have applications with. Everything else in your inbox is ignored and never stored. Grad
        Jobs&apos; use of information received from Google APIs adheres to the{" "}
        <a className="text-accent underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. Gmail data is never used for advertising, never sold, never shared, and never used to train AI models.
      </p>

      <H>Who can see it</H>
      <p className="mt-2">
        Only you. Each account can only read its own data. Nothing is shared with other users, sold, or used for ads. Some features send the minimum needed to
        services that run them: Supabase (database and file storage, EU), Vercel (hosting), Anthropic (AI tools you choose to run, and reading relevant employer
        emails), Resend and Telegram (alerts you switch on).
      </p>

      <H>Deleting your data</H>
      <p className="mt-2">
        &quot;Delete my account&quot; on your profile permanently removes your account, files, applications and Gmail link straight away. Questions:{" "}
        <a className="text-accent underline" href="mailto:mihirpbhatnagar@gmail.com">
          mihirpbhatnagar@gmail.com
        </a>
        .
      </p>
    </main>
  );
}

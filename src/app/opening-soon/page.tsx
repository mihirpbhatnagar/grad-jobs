import { ComingCard, PageBand } from "@/components/SectionIntro";

const HOW = [
  { title: "Register-interest pages", body: "Many big employers open a \"register your interest\" page before their 2027 scheme goes live. Each one we find is flagged here with the employer's own link." },
  { title: "Follow a company", body: "Tap Follow on any company and you'll get a Telegram alert the day it posts a role." },
  { title: "Graduate scheme calendar", body: "From next year, the app records when each scheme opened and closed, so you know exactly when to be ready." },
];

export default function OpeningSoonPage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 pb-24 pt-6 sm:px-6">
      <PageBand title="Opening soon" lead="Graduate schemes that haven't opened yet, so you can be first in when they do." />
      <div className="grid gap-3 sm:grid-cols-3">
        {HOW.map((h, i) => (
          <section key={h.title} className="rounded-xl border border-border bg-surface p-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-soft text-sm font-bold text-accent">{i + 1}</span>
            <h2 className="mt-3 font-semibold tracking-tight">{h.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{h.body}</p>
          </section>
        ))}
      </div>
      <ComingCard
        items={[
          "Register-interest flags come with the employer watch list (being built next).",
          "Follow-a-company alerts arrive with Telegram alerts.",
          "Scheme calendar starts recording open and close dates from this season.",
        ]}
      />
    </main>
  );
}

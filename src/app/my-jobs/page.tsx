import { SectionIntro } from "@/components/SectionIntro";

export default function MyJobsPage() {
  return (
    <SectionIntro
      title="My jobs"
      lead="Your recommended roles, saved roles and applications in one place."
      coming={[
        "For you: roles matched to your profile, with the reasons they match",
        "Saved: one tap to save from anywhere, with deadline countdowns",
        "Application tracker: Applied → Test → Interview → Assessment centre → Offer",
        "Dashboard: response rates and upcoming interview dates",
      ]}
    />
  );
}

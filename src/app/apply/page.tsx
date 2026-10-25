import { SectionIntro } from "@/components/SectionIntro";

export default function ApplyPage() {
  return (
    <SectionIntro
      title="Apply"
      lead="Your saved roles and every application you've made."
      coming={[
        "Saved roles, ready to apply to",
        "Mark as applied to move a role into your tracker",
        "Application tracker and dashboard",
      ]}
    />
  );
}

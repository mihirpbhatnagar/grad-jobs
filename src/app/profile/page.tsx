import { SectionIntro } from "@/components/SectionIntro";

export default function ProfilePage() {
  return (
    <SectionIntro
      title="Your profile"
      lead="Everything that shapes For you, editable any time."
      coming={[
        "Sign in with a private account",
        "Upload your CV",
        "Roles you're looking for, what you want from your first role, locations and salary",
        "Use in For you switches for each answer",
      ]}
    />
  );
}

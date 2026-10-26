import { StoryBank } from "@/components/StoryBank";
import { currentUser } from "@/lib/auth";

// Asks for the story bank the first time a signed-in user reaches Apply; afterwards it
// collapses to a one-line summary with an Edit button.
export async function StoryBankSection() {
  const { db, user } = await currentUser();
  if (!user) return null;
  const { data } = await db.from("profiles").select("story_bank").maybeSingle();
  return <StoryBank initial={data?.story_bank ?? ""} />;
}

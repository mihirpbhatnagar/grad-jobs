import { StoryBank } from "@/components/StoryBank";
import { StyleNotes } from "@/components/StyleNotes";
import { currentUser } from "@/lib/auth";

// Asks for the story bank the first time a signed-in user reaches Apply; afterwards it
// collapses to a one-line summary with an Edit button. Style notes sit alongside.
export async function StoryBankSection() {
  const { db, user } = await currentUser();
  if (!user) return null;
  const { data } = await db.from("profiles").select("story_bank,style_notes").maybeSingle();
  return (
    <div className="space-y-4">
      <StoryBank initial={data?.story_bank ?? ""} />
      <StyleNotes initial={data?.style_notes ?? ""} />
    </div>
  );
}

// Stages a saved role moves through, in order.
export const STAGES = [
  { id: "saved", label: "Saved" },
  { id: "applying", label: "Applying" },
  { id: "applied", label: "Applied" },
  { id: "test", label: "Test" },
  { id: "interview", label: "Interview" },
  { id: "assessment_centre", label: "Assessment centre" },
  { id: "offer", label: "Offer" },
  { id: "rejected", label: "Rejected" },
] as const;

export type Stage = (typeof STAGES)[number]["id"];

export const stageLabel = (id: string) => STAGES.find((s) => s.id === id)?.label ?? id;

export const isStage = (value: string): value is Stage => STAGES.some((s) => s.id === value);

// Stages after "applied" that mean the employer responded.
export const RESPONDED: Stage[] = ["test", "interview", "assessment_centre", "offer", "rejected"];

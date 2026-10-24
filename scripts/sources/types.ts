// The shape every source (Reed, Google Jobs, employer feeds...) is converted into.
export type Listing = {
  source: string;
  sourceId: string;
  sourceUrl: string | null;
  title: string;
  employer: string;
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryText: string | null;
  contractType: string | null;
  fullTime: boolean | null;
  partTime: boolean;
  description: string;
  applyUrl: string | null;
  postedAt: string | null;
  expiresAt: string | null;
};

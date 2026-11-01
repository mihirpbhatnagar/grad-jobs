// Turns the user's profile text into a meaning-embedding inside their own browser, using the
// same free model the daily job uses for roles. Loaded only when needed (first use downloads
// the ~25 MB model once; the browser caches it).
export async function embedInBrowser(text: string): Promise<number[] | null> {
  if (!text.trim()) return null;
  try {
    const { pipeline } = await import("@huggingface/transformers");
    const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8" });
    const out = await extractor(text, { pooling: "mean", normalize: true });
    return Array.from(out.data as Float32Array);
  } catch {
    return null; // matching falls back to keywords
  }
}

// Several texts at once (one model load): for ranking story bank notes and CV bullets against a role.
export async function embedManyInBrowser(texts: string[]): Promise<number[][] | null> {
  if (!texts.length) return [];
  try {
    const { pipeline } = await import("@huggingface/transformers");
    const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8" });
    const out = await extractor(texts, { pooling: "mean", normalize: true });
    return out.tolist() as number[][];
  } catch {
    return null;
  }
}

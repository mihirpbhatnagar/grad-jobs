import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

// Free open-source embedding model (all-MiniLM-L6-v2): turns text into 384 numbers so that
// texts with similar meaning end up close together. Runs locally; no paid API.
export const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";

let extractor: FeatureExtractionPipeline | null = null;

export async function embed(texts: string[]): Promise<number[][]> {
  extractor ??= await pipeline("feature-extraction", EMBED_MODEL, { dtype: "q8" });
  const out = await extractor(texts, { pooling: "mean", normalize: true });
  return out.tolist() as number[][];
}

// What a role "means": its title plus the start of its description.
export const roleText = (title: string, description: string | null) => `${title}. ${(description ?? "").slice(0, 1200)}`;

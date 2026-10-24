import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env.ts";

// Server-side client with the secret key: bypasses row-level security, so it must
// only ever run in the daily job, never in the browser.
export function adminClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });
}

type Result<T> = { data: T | null; error: { message: string } | null };

// Runs a Supabase request and returns its data, retrying brief network drops
// (the first full load lost its connection once mid-save).
export async function must<T>(make: () => PromiseLike<Result<T>>, attempts = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await make();
    if (!error) return data as T;
    const transient = /terminated|ECONNRESET|fetch failed|timed? ?out|socket|50[234]/i.test(error.message);
    if (!transient || attempt >= attempts) throw new Error(error.message);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}

// Supabase returns at most 1,000 rows per request, so read big tables page by page.
export async function selectAll<T>(build: (from: number, to: number) => PromiseLike<Result<T[]>>, pageSize = 1000): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const data = await must(() => build(from, from + pageSize - 1));
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

export function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

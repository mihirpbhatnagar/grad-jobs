import { createClient } from "@supabase/supabase-js";

// Read-only client for server components. Uses the publishable key, so row-level
// security decides what it can see.
export function publicClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

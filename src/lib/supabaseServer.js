import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const fallbackAnonKey = process.env.SUPABASE_ANON_KEY;

export function getSupabaseServiceClient(options = {}) {
  const key = serviceRoleKey || fallbackAnonKey;
  if (!supabaseUrl || !key) return null;
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => fetch(input, { cache: "no-store", ...init }),
    },
    ...options,
  });
}

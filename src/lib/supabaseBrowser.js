import { createClient } from "@supabase/supabase-js";

let browserClient = null;

function resolveEnv(name) {
  if (typeof process === "undefined" || !process.env) return undefined;
  return process.env[name];
}

export function getSupabaseBrowserClient() {
  if (typeof window === "undefined") return null;
  if (browserClient) return browserClient;

  const url = resolveEnv("NEXT_PUBLIC_SUPABASE_URL") || resolveEnv("SUPABASE_URL");
  const anonKey = resolveEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") || resolveEnv("SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;

  browserClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      storageKey: "dinnerdecider-sb-auth",
    },
    realtime: {
      params: {
        eventsPerSecond: 5,
      },
    },
  });

  return browserClient;
}

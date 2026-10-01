import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { operationalHandler } from "./evaluator.mjs";

// One client per request, using the caller's verified JWT for every RLS read.
// No service-role client, operational RPC, logging of business data or writes.
const handler = operationalHandler({
  clientForToken: (token: string) => {
    const url = Deno.env.get("SUPABASE_URL");
    let publicKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    try {
      const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
      if (typeof keys.default === "string" && keys.default.startsWith("sb_publishable_")) publicKey = keys.default;
    } catch { /* The default legacy anon key remains valid. */ }
    if (!url || !publicKey || publicKey.startsWith("sb_secret_")) throw new Error("Missing public configuration");
    return createClient(url, publicKey, {
      global: {
        headers: { Authorization: "Bearer " + token },
        fetch: (input, init) => fetch(input, {
          ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
        }),
      },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  },
});
Deno.serve(handler);

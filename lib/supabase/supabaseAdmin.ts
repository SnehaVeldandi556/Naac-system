// Server-only client using the service role key.
// Bypasses RLS — only import this inside app/api/** route handlers, NEVER in
// client components, and never send this key to the browser.
import { createClient } from "@supabase/supabase-js";

export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

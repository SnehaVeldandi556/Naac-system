// lib/supabase/admin.ts
import { createClient } from '@supabase/supabase-js';

// Service-role client — bypasses RLS entirely.
// NEVER use this to authenticate a request. Trusted server-only operations only.
export function getSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
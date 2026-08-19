// lib/supabase/server.ts
import { createClient } from '@supabase/supabase-js';

export function getSupabaseServerClient() {
  console.log('URL present:', !!process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('KEY present:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
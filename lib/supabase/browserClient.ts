// lib/supabase/browserClient.ts
'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function supabaseBrowser() {
  if (client) return client;

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'https://jxeersohidkynjobrbug.supabase.co';
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4ZWVyc29oaWRreW5qb2JyYnVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MjM1NjYsImV4cCI6MjEwMjI5OTU2Nn0.oFx6EFmjS2Y0lxFY2Uk2bedRUr9KHrhSQDXT8_LY6wc';

  client = createBrowserClient(url, anonKey);
  return client;
}
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function testAccept() {
  const tokenHash = 'd1b861edfaf289c424b88d41bdfb6da85b3167ea84d40eb4b73f5ae7';
  console.log('Testing verifyOtp with token_hash:', tokenHash);

  const { data, error } = await supabaseAnon.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'invite',
  });

  if (error) {
    console.error('verifyOtp error:', error);
  } else {
    console.log('verifyOtp SUCCESS!', data.session?.user.email);
  }
}

testAccept().catch(console.error);

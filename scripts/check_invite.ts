import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('Testing Supabase Admin Auth connection...');
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('List users error:', listError);
    return;
  }
  console.log(`Total existing users: ${users.length}`);
  for (const u of users) {
    console.log(`- ${u.email} (id: ${u.id}, confirmed: ${u.email_confirmed_at}, invited: ${u.invited_at})`);
  }

  const { data: profiles, error: profError } = await supabase.from('profiles').select('*');
  console.log('\nProfiles:', profiles);

  const { data: invites, error: invError } = await supabase.from('invites').select('*');
  console.log('\nInvites:', invites);

  // Test what happens when inviting or generating link
  console.log('\nTesting generateLink vs inviteUserByEmail...');
  const testEmail = 'dubeyanurag340@gmail.com';
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email: testEmail,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/accept-invite`,
      data: { full_name: 'Anurag Dubey', role: 'hod' },
    },
  });

  if (linkErr) {
    console.error('generateLink error:', linkErr);
  } else {
    console.log('generateLink SUCCESS!');
    console.log('Action link properties:', linkData);
  }

  const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
    testEmail,
    {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/accept-invite`,
      data: { full_name: 'Anurag Dubey', role: 'hod' },
    }
  );

  if (inviteErr) {
    console.error('inviteUserByEmail error:', inviteErr);
  } else {
    console.log('inviteUserByEmail SUCCESS:', inviteData);
  }
}

main().catch(console.error);

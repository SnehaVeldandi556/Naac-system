import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testInvite(email: string, fullName: string, role: string, deptId: string) {
  console.log(`\nTesting invite for: ${email}`);

  // 1. Check if user already exists in auth.users
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const existing = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

  if (existing) {
    console.log(`Found existing auth user: ${existing.id}, confirmed_at: ${existing.email_confirmed_at}`);
    if (!existing.email_confirmed_at) {
      console.log('User is unconfirmed. Deleting stale auth user...');
      await supabase.auth.admin.deleteUser(existing.id);
      await supabase.from('invites').update({ status: 'revoked' }).eq('email', email).eq('status', 'pending');
    }
  }

  // 2. Generate Invite Link
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/accept-invite`;
  console.log('Generating invite link with redirectTo:', redirectTo);

  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      redirectTo,
      data: { full_name: fullName, role, department_id: deptId },
    },
  });

  if (linkErr) {
    console.error('generateLink failed:', linkErr);
    return;
  }

  const userId = linkData.user.id;
  const tokenHash = linkData.properties?.hashed_token;
  const directLink = `${redirectTo}?token_hash=${tokenHash}&type=invite`;

  console.log('User ID:', userId);
  console.log('Token Hash:', tokenHash);
  console.log('Direct Invite Link:', directLink);

  // 3. Upsert Profile
  const { error: profErr } = await supabase.from('profiles').upsert({
    id: userId,
    email,
    full_name: fullName,
    role,
    department_id: deptId,
    status: 'invited',
  });
  if (profErr) {
    console.error('Profile upsert error:', profErr);
  } else {
    console.log('Profile created successfully!');
  }

  // 4. Insert Invites record
  const { error: invErr } = await supabase.from('invites').insert({
    email,
    full_name: fullName,
    role,
    department_id: deptId,
    invited_by: 'fd7cbaa5-2d9a-4f29-8a7e-493dd9e467c2', // admin id
    token: tokenHash,
    status: 'pending',
  });
  if (invErr) {
    console.error('Invites insert error:', invErr);
  } else {
    console.log('Invite record created successfully!');
  }

  // 5. Try sending email if SMTP is configured (non-fatal)
  try {
    const { error: emailErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { full_name: fullName, role, department_id: deptId },
    });
    if (emailErr) {
      console.log('Note: Supabase default SMTP email sending skipped/rate-limited:', emailErr.message);
    } else {
      console.log('Email sent via Supabase SMTP successfully!');
    }
  } catch (e) {
    console.log('SMTP error caught gracefully');
  }
}

async function run() {
  const { data: depts } = await supabase.from('departments').select('*').limit(1);
  const deptId = depts?.[0]?.id || '17956104-ff97-477e-87e1-238cf120a36c';
  await testInvite('dubeyanurag340@gmail.com', 'Anurag Dubey', 'hod', deptId);
}

run().catch(console.error);

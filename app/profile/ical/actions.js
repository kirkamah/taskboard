'use server';

import { randomBytes } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Generate (or rotate) a personal iCal token. Rotating instantly breaks
// any existing calendar subscription that used the previous URL — that's
// by design, it's the only way to revoke access.
export async function generateIcalToken() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthorized' };

  const token = randomBytes(24).toString('hex');
  const admin = createAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({ ical_token: token })
    .eq('id', user.id);
  if (error) return { error: error.message };
  return { token };
}

export async function revokeIcalToken() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthorized' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({ ical_token: null })
    .eq('id', user.id);
  if (error) return { error: error.message };
  return { ok: true };
}

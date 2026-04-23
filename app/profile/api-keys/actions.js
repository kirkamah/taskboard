'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateApiKey } from '@/lib/apiKeys';

// Server actions mutate via the service-role admin client since RLS is permissive
// and we already trust the cookie-authenticated user_id established here.

export async function createApiKey(name) {
  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (!cleanName) return { error: 'Имя ключа не может быть пустым' };
  if (cleanName.length > 100) return { error: 'Имя ключа слишком длинное (макс 100 символов)' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Не авторизованы' };

  const { full, prefix, hash } = generateApiKey();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('api_keys')
    .insert({ user_id: user.id, name: cleanName, prefix, key_hash: hash })
    .select('id, name, prefix, created_at')
    .single();
  if (error) return { error: 'Не удалось создать ключ: ' + error.message };

  // full is returned ONLY this once; it is never stored in plaintext.
  return { key: { ...data, full } };
}

export async function revokeApiKey(keyId) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Не авторизованы' };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('api_keys')
    .select('id, user_id, revoked_at')
    .eq('id', keyId)
    .maybeSingle();
  if (!existing) return { error: 'Ключ не найден' };
  if (existing.user_id !== user.id) return { error: 'Это не ваш ключ' };
  if (existing.revoked_at) return { ok: true };

  const { error } = await admin
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId);
  if (error) return { error: 'Не удалось отозвать ключ: ' + error.message };
  return { ok: true };
}

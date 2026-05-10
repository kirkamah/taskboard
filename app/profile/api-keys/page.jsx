import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Navbar from '@/components/Navbar';
import ApiKeysClient from '@/components/ApiKeysClient';
import { readLocale, tFor } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function ApiKeysPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_emoji, avatar_color, locale')
    .eq('id', user.id)
    .single();
  const userName = profile?.display_name || user.email.split('@')[0];
  const locale = await readLocale({ profileLocale: profile?.locale });
  const t = tFor(locale);

  // Service-role read bypasses RLS, which is fine — we filter by user.id from
  // the authenticated cookie session.
  const admin = createAdminClient();
  const { data: keys } = await admin
    .from('api_keys')
    .select('id, name, prefix, created_at, last_used_at, revoked_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <>
      <Navbar userName={userName} userId={user.id} userProfile={profile} locale={locale} />
      <div className="max-w-3xl mx-auto px-6 py-8">
        <Link href="/profile" className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1 mb-4">
          <ArrowLeft size={16} /> {t('apiKeys.toProfile')}
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">{t('apiKeys.title')}</h1>
        <p className="text-sm text-gray-500 mb-6">
          {t('apiKeys.intro')}{' '}
          {t('apiKeys.docsLinkPart1')} <Link href="/api-docs" className="underline hover:text-gray-900">{t('apiKeys.docsLinkPart2')}</Link>{t('apiKeys.docsLinkPart3')}
        </p>
        <ApiKeysClient initialKeys={keys || []} locale={locale} />
      </div>
    </>
  );
}

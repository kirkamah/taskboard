import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Navbar from '@/components/Navbar';
import WebhooksClient from '@/components/WebhooksClient';
import { readLocale, tFor } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function WebhooksPage() {
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

  const admin = createAdminClient();
  const { data: hooks } = await admin
    .from('webhook_subscriptions')
    .select('id, url, secret, is_active, created_at, last_delivered_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <>
      <Navbar userName={userName} userId={user.id} userProfile={profile} locale={locale} />
      <div className="max-w-3xl mx-auto px-6 py-8">
        <Link href="/profile" className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1 mb-4">
          <ArrowLeft size={16} /> {t('webhooks.toProfile')}
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">{t('webhooks.title')}</h1>
        <p className="text-sm text-gray-500 mb-6">
          {t('webhooks.intro')}
        </p>
        <WebhooksClient initialHooks={hooks || []} locale={locale} />
      </div>
    </>
  );
}

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Navbar from '@/components/Navbar';
import WebhooksClient from '@/components/WebhooksClient';

export const dynamic = 'force-dynamic';

export default async function WebhooksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_emoji, avatar_color')
    .eq('id', user.id)
    .single();
  const userName = profile?.display_name || user.email.split('@')[0];

  const admin = createAdminClient();
  const { data: hooks } = await admin
    .from('webhook_subscriptions')
    .select('id, url, secret, is_active, created_at, last_delivered_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <>
      <Navbar userName={userName} userId={user.id} userProfile={profile} />
      <div className="max-w-3xl mx-auto px-6 py-8">
        <Link href="/profile" className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1 mb-4">
          <ArrowLeft size={16} /> К профилю
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Webhooks</h1>
        <p className="text-sm text-gray-500 mb-6">
          POST на твой URL при каждом событии в задачах, которые ты видишь — личных и в комнатах. Подходит для Zapier, n8n, своих скриптов.
        </p>
        <WebhooksClient initialHooks={hooks || []} />
      </div>
    </>
  );
}

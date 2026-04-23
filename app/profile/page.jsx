import Link from 'next/link';
import { redirect } from 'next/navigation';
import { KeyRound, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import Navbar from '@/components/Navbar';
import ProfileClient from '@/components/ProfileClient';

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_emoji, avatar_color, theme')
    .eq('id', user.id)
    .single();

  const safeProfile = profile || { display_name: user.email.split('@')[0], avatar_emoji: null, avatar_color: 'gray', theme: 'light' };
  const userName = safeProfile.display_name || user.email.split('@')[0];

  return (
    <>
      <Navbar userName={userName} userId={user.id} userProfile={safeProfile} />
      <ProfileClient userId={user.id} initialProfile={safeProfile} />
      <div className="max-w-2xl mx-auto px-6 pb-10">
        <Link
          href="/profile/api-keys"
          className="block bg-white border border-gray-200 rounded-lg p-5 hover:border-gray-900 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="text-gray-700"><KeyRound size={20} /></div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900">API-ключи</h3>
              <p className="text-sm text-gray-500 mt-0.5">Подключить ChatGPT, Claude Desktop или свой скрипт к задачам</p>
            </div>
            <ChevronRight size={18} className="text-gray-400 flex-shrink-0" />
          </div>
        </Link>
      </div>
    </>
  );
}

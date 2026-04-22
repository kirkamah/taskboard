import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import Navbar from '@/components/Navbar';
import BoardBody from '@/components/BoardBody';

export default async function MyBoardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_emoji, avatar_color')
    .eq('id', user.id)
    .single();

  const userName = profile?.display_name || user.email.split('@')[0];

  return (
    <>
      <Navbar userName={userName} userId={user.id} userProfile={profile} />
      <div className="max-w-7xl mx-auto px-6 py-6">
        <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1 mb-2">
          <ArrowLeft size={16} /> На главную
        </Link>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Моя доска</h1>
          <p className="text-sm text-gray-500 mt-1">Личные задачи · видите только вы</p>
        </div>
        <BoardBody scope="personal" userId={user.id} canEdit={true} />
      </div>
    </>
  );
}

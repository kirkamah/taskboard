'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LogOut, Home } from 'lucide-react';
import NotificationBell from './NotificationBell';

export default function Navbar({ userName, userId }) {
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="font-semibold text-gray-900 flex items-center gap-2">
          <Home size={18} /> Taskboard
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {userId && <NotificationBell userId={userId} />}
          <span className="text-gray-500">{userName}</span>
          <button
            onClick={handleLogout}
            className="text-gray-500 hover:text-gray-900 flex items-center gap-1"
          >
            <LogOut size={14} /> Выйти
          </button>
        </div>
      </div>
    </nav>
  );
}

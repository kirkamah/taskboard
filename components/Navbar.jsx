'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LogOut, Home, User, ChevronDown } from 'lucide-react';
import NotificationBell from './NotificationBell';
import Avatar from './Avatar';

export default function Navbar({ userName, userId, userProfile }) {
  const router = useRouter();
  const supabase = createClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const profileForAvatar = userProfile || { display_name: userName, avatar_emoji: null, avatar_color: 'gray' };

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="font-semibold text-gray-900 flex items-center gap-2">
          <Home size={18} /> Taskboard
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {userId && <NotificationBell userId={userId} />}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-gray-100 text-gray-700"
            >
              <Avatar profile={profileForAvatar} size={24} />
              <span className="text-gray-700">{userName}</span>
              <ChevronDown size={14} className="text-gray-400" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                <Link
                  href="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <User size={14} /> Профиль
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <LogOut size={14} /> Выйти
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

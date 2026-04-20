'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name || email.split('@')[0] } }
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    if (data.user && !data.session) {
      // Нужно подтверждение email
      setError('Проверьте почту и подтвердите email, чтобы войти.');
      setLoading(false);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-lg p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Регистрация</h1>
        <p className="text-sm text-gray-500 mb-6">Создайте аккаунт, чтобы начать</p>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">Имя</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Как к вам обращаться"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Минимум 6 символов"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-900"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300"
          >
            {loading ? 'Создаём...' : 'Создать аккаунт'}
          </button>
        </form>

        <p className="text-sm text-gray-600 mt-6 text-center">
          Уже есть аккаунт?{' '}
          <Link href="/login" className="text-gray-900 font-medium hover:underline">Войти</Link>
        </p>
      </div>
    </div>
  );
}

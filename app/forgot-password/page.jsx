'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { translate, getClientLocale } from '@/lib/i18n';

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [locale, setLocale] = useState('ru');
  useEffect(() => { setLocale(getClientLocale()); }, []);
  const t = (k, p) => translate(locale, k, p);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password'
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-lg p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">{t('auth.forgot.title')}</h1>
        <p className="text-sm text-gray-500 mb-6">{t('auth.forgot.subtitle')}</p>

        {sent ? (
          <p className="text-sm text-gray-700">{t('auth.forgot.sent')}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">{t('auth.email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-900"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300"
            >
              {loading ? t('auth.login.submitting') : t('auth.forgot.submit')}
            </button>
          </form>
        )}

        <p className="text-sm text-gray-600 mt-6 text-center">
          <Link href="/login" className="text-gray-900 font-medium hover:underline">{t('auth.signup.loginLink')}</Link>
        </p>
      </div>
    </div>
  );
}

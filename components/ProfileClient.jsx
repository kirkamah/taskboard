'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Smile, Type, Palette } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Avatar, { AVATAR_COLORS, avatarBgClass } from '@/components/Avatar';
import PushToggle from '@/components/PushToggle';
import LocaleSwitcher from '@/components/LocaleSwitcher';
import { THEMES, applyTheme } from '@/lib/theme';
import { translate } from '@/lib/i18n';

// Small preview tile shown in the theme picker — a surface swatch with an
// accent dot so users can see what "cosmic" actually looks like.
const THEME_PREVIEWS = {
  light:     { bg: '#f9fafb', surface: '#ffffff', accent: '#111827', border: '#e5e7eb' },
  dark:      { bg: '#0f172a', surface: '#1e293b', accent: '#6366f1', border: '#334155' },
  cosmic:    { bg: '#0a0724', surface: '#170d3d', accent: '#c026d3', border: '#3b1d7a' },
  parchment: { bg: '#e8d3a0', surface: '#f3e4bd', accent: '#8b2e1a', border: '#b89a5e' },
};

const EMOJI_OPTIONS = [
  '😀', '😎', '🚀', '🎯', '⭐', '🔥', '💎', '🌟',
  '🎨', '🎮', '🏆', '⚡', '🌈', '🎵', '📚', '💡',
  '🎭', '🎬', '🏠', '🌱', '🦁', '🐱', '🐻', '🦄',
  '🍕', '☕', '🎂', '🎁', '🧩', '🔮',
];

export default function ProfileClient({ userId, initialProfile, initialLocale = 'ru' }) {
  const t = (k, p) => translate(initialLocale, k, p);
  const supabase = createClient();
  const [displayName, setDisplayName] = useState(initialProfile.display_name || '');
  const [avatarEmoji, setAvatarEmoji] = useState(initialProfile.avatar_emoji || null);
  const [avatarColor, setAvatarColor] = useState(initialProfile.avatar_color || 'gray');
  const [theme, setTheme] = useState(initialProfile.theme || 'light');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Theme switches persist immediately — if we waited for the Save button,
  // navigating away before saving would revert to the DB value on the next
  // page (Navbar re-fetches on mount) and users would think it's broken.
  const pickTheme = async (next) => {
    if (next === theme) return;
    setTheme(next);
    applyTheme(next);
    await supabase.from('profiles').update({ theme: next }).eq('id', userId);
  };

  const previewProfile = {
    display_name: displayName || t('common.user'),
    avatar_emoji: avatarEmoji,
    avatar_color: avatarColor,
  };

  const save = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      setError(t('profile.nameRequired'));
      return;
    }
    setSaving(true);
    setError('');
    const { error: err } = await supabase
      .from('profiles')
      .update({
        display_name: trimmed,
        avatar_emoji: avatarEmoji,
        avatar_color: avatarColor,
        theme,
      })
      .eq('id', userId);
    setSaving(false);
    if (err) {
      setError(t('profile.saveError', { message: err.message }));
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1 mb-4">
        <ArrowLeft size={16} /> {t('profile.back')}
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">{t('profile.title')}</h1>

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
        <div>
          <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
            {t('profile.displayName')}
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t('profile.namePlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-900"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-3">
            {t('profile.avatar')}
          </label>
          <div className="flex items-center gap-4 mb-4">
            <Avatar profile={previewProfile} size={72} />
            <div className="text-sm text-gray-500">
              {avatarEmoji
                ? t('profile.avatarEmojiOn', { emoji: avatarEmoji, color: t(`profile.color.${avatarColor}`) })
                : t('profile.avatarLetterOn', { color: t(`profile.color.${avatarColor}`) })}
            </div>
          </div>

          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-2">{t('profile.bgColor')}</p>
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLORS.map((c) => {
                const selected = c === avatarColor;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAvatarColor(c)}
                    title={t(`profile.color.${c}`)}
                    className={`w-8 h-8 rounded-full ${avatarBgClass(c)} border-2 ${selected ? 'border-gray-900 ring-2 ring-gray-900 ring-offset-2' : 'border-transparent'} transition-all`}
                  />
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-2">{t('profile.icon')}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 flex items-center gap-2"
              >
                <Smile size={14} /> {showEmojiPicker ? t('profile.hideEmoji') : t('profile.pickEmoji')}
              </button>
              <button
                type="button"
                onClick={() => { setAvatarEmoji(null); setShowEmojiPicker(false); }}
                disabled={!avatarEmoji}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Type size={14} /> {t('profile.letterOnly')}
              </button>
            </div>
            {showEmojiPicker && (
              <div className="mt-3 p-3 border border-gray-200 rounded-lg bg-gray-50">
                <div className="grid grid-cols-10 gap-1">
                  {EMOJI_OPTIONS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => { setAvatarEmoji(e); setShowEmojiPicker(false); }}
                      className={`w-9 h-9 rounded-md text-xl hover:bg-white flex items-center justify-center ${avatarEmoji === e ? 'bg-white ring-2 ring-gray-900' : ''}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100">
          <label className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Palette size={12} /> {t('profile.themeHeading')}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {THEMES.map((th) => {
              const preview = THEME_PREVIEWS[th];
              const selected = theme === th;
              let tileBg = preview.bg;
              if (th === 'cosmic') {
                tileBg = `radial-gradient(120% 140% at 10% 0%, rgba(192,38,211,0.55), transparent 55%), radial-gradient(120% 100% at 90% 100%, rgba(79,70,229,0.55), transparent 55%), ${preview.bg}`;
              } else if (th === 'parchment') {
                tileBg = `radial-gradient(100% 90% at 15% 10%, rgba(120,78,28,0.18), transparent 60%), radial-gradient(90% 80% at 85% 90%, rgba(90,55,20,0.16), transparent 65%), ${preview.bg}`;
              }
              const accentShadow = th === 'cosmic'
                ? `0 0 10px ${preview.accent}`
                : th === 'parchment'
                  ? `0 0 4px rgba(139,46,26,0.5)`
                  : 'none';
              return (
                <button
                  key={th}
                  type="button"
                  onClick={() => pickTheme(th)}
                  className={`text-left rounded-lg p-3 border-2 transition ${selected ? 'border-gray-900' : 'border-gray-200 hover:border-gray-400'}`}
                >
                  <div
                    className="h-14 rounded-md mb-2 relative overflow-hidden"
                    style={{
                      background: tileBg,
                      borderColor: preview.border,
                    }}
                  >
                    <span
                      className="absolute top-2 left-2 right-2 bottom-2 rounded-sm"
                      style={{ backgroundColor: preview.surface, border: `1px solid ${preview.border}` }}
                    />
                    <span
                      className="absolute bottom-3 right-3 w-4 h-4 rounded-full"
                      style={{ backgroundColor: preview.accent, boxShadow: accentShadow }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">{t(`profile.theme.${th}`)}</span>
                    {selected && <Check size={14} className="text-gray-900" />}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 leading-snug">
                    {t(`profile.themeDesc.${th}`)}
                  </p>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {t('profile.themeHint')}
          </p>
        </div>

        <div className="pt-6 border-t border-gray-100">
          <h2 className="text-sm font-medium text-gray-700 uppercase tracking-wide mb-3">{t('profile.notificationsHeading')}</h2>
          <PushToggle userId={userId} locale={initialLocale} />
        </div>

        <div className="pt-6 border-t border-gray-100">
          <h2 className="text-sm font-medium text-gray-700 uppercase tracking-wide mb-3">{t('profile.languageHeading')}</h2>
          <LocaleSwitcher initialLocale={initialLocale} />
          <p className="text-xs text-gray-500 mt-2">
            {t('profile.localeHint')}
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
          <button
            onClick={save}
            disabled={saving || !displayName.trim()}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300"
          >
            {saving ? t('profile.saving') : t('common.save')}
          </button>
          {saved && (
            <span className="text-sm text-green-700 flex items-center gap-1">
              <Check size={14} /> {t('common.saved')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

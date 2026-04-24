'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Smile, Type, Palette } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Avatar, { AVATAR_COLORS, avatarBgClass } from '@/components/Avatar';
import { THEMES, THEME_LABELS, THEME_DESCRIPTIONS, applyTheme } from '@/lib/theme';

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

const COLOR_LABEL = {
  gray: 'Серый',
  red: 'Красный',
  orange: 'Оранжевый',
  amber: 'Янтарный',
  green: 'Зелёный',
  teal: 'Бирюзовый',
  blue: 'Синий',
  purple: 'Фиолетовый',
};

export default function ProfileClient({ userId, initialProfile }) {
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
    display_name: displayName || 'Пользователь',
    avatar_emoji: avatarEmoji,
    avatar_color: avatarColor,
  };

  const save = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      setError('Имя не может быть пустым');
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
      setError('Не удалось сохранить: ' + err.message);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1 mb-4">
        <ArrowLeft size={16} /> На главную
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Профиль</h1>

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
        <div>
          <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
            Отображаемое имя
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Как вас называть"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-900"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-3">
            Аватар
          </label>
          <div className="flex items-center gap-4 mb-4">
            <Avatar profile={previewProfile} size={72} />
            <div className="text-sm text-gray-500">
              {avatarEmoji
                ? <>Эмодзи <span className="text-base">{avatarEmoji}</span> на фоне «{COLOR_LABEL[avatarColor]}»</>
                : <>Первая буква имени на фоне «{COLOR_LABEL[avatarColor]}»</>}
            </div>
          </div>

          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-2">Цвет фона</p>
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLORS.map((c) => {
                const selected = c === avatarColor;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAvatarColor(c)}
                    title={COLOR_LABEL[c]}
                    className={`w-8 h-8 rounded-full ${avatarBgClass(c)} border-2 ${selected ? 'border-gray-900 ring-2 ring-gray-900 ring-offset-2' : 'border-transparent'} transition-all`}
                  />
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-2">Значок</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 flex items-center gap-2"
              >
                <Smile size={14} /> {showEmojiPicker ? 'Скрыть' : 'Выбрать эмодзи'}
              </button>
              <button
                type="button"
                onClick={() => { setAvatarEmoji(null); setShowEmojiPicker(false); }}
                disabled={!avatarEmoji}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Type size={14} /> Только буква
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
            <Palette size={12} /> Тема оформления
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {THEMES.map((t) => {
              const preview = THEME_PREVIEWS[t];
              const selected = theme === t;
              let tileBg = preview.bg;
              if (t === 'cosmic') {
                tileBg = `radial-gradient(120% 140% at 10% 0%, rgba(192,38,211,0.55), transparent 55%), radial-gradient(120% 100% at 90% 100%, rgba(79,70,229,0.55), transparent 55%), ${preview.bg}`;
              } else if (t === 'parchment') {
                tileBg = `radial-gradient(100% 90% at 15% 10%, rgba(120,78,28,0.18), transparent 60%), radial-gradient(90% 80% at 85% 90%, rgba(90,55,20,0.16), transparent 65%), ${preview.bg}`;
              }
              const accentShadow = t === 'cosmic'
                ? `0 0 10px ${preview.accent}`
                : t === 'parchment'
                  ? `0 0 4px rgba(139,46,26,0.5)`
                  : 'none';
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => pickTheme(t)}
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
                    <span className="text-sm font-medium text-gray-900">{THEME_LABELS[t]}</span>
                    {selected && <Check size={14} className="text-gray-900" />}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 leading-snug">
                    {THEME_DESCRIPTIONS[t]}
                  </p>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Применяется сразу и сохраняется в аккаунте — увидите её на любом устройстве.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
          <button
            onClick={save}
            disabled={saving || !displayName.trim()}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300"
          >
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </button>
          {saved && (
            <span className="text-sm text-green-700 flex items-center gap-1">
              <Check size={14} /> Сохранено
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

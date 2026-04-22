'use client';

export const AVATAR_COLORS = ['gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'purple'];

// Tailwind-класс фона для каждого цвета. Перечисляем явно, чтобы не зависеть от
// динамической сборки имён классов (Tailwind их не увидел бы при purge).
const BG_CLASS = {
  gray: 'bg-gray-200',
  red: 'bg-red-200',
  orange: 'bg-orange-200',
  amber: 'bg-amber-200',
  green: 'bg-green-200',
  teal: 'bg-teal-200',
  blue: 'bg-blue-200',
  purple: 'bg-purple-200',
};

const TEXT_CLASS = {
  gray: 'text-gray-700',
  red: 'text-red-800',
  orange: 'text-orange-800',
  amber: 'text-amber-800',
  green: 'text-green-800',
  teal: 'text-teal-800',
  blue: 'text-blue-800',
  purple: 'text-purple-800',
};

export function avatarBgClass(color) {
  return BG_CLASS[color] || BG_CLASS.gray;
}

export function avatarTextClass(color) {
  return TEXT_CLASS[color] || TEXT_CLASS.gray;
}

export default function Avatar({ profile, size = 24, title }) {
  const name = profile?.display_name || 'Пользователь';
  const emoji = profile?.avatar_emoji || null;
  const color = profile?.avatar_color || 'gray';
  const initial = (name.trim()[0] || '?').toUpperCase();

  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) };

  return (
    <div
      className={`rounded-full border border-white flex items-center justify-center font-medium flex-shrink-0 ${avatarBgClass(color)} ${emoji ? '' : avatarTextClass(color)}`}
      style={style}
      title={title ?? name}
    >
      {emoji ? <span style={{ fontSize: Math.round(size * 0.6), lineHeight: 1 }}>{emoji}</span> : initial}
    </div>
  );
}

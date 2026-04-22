'use client';

export const TAG_COLORS = ['gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink'];

// Tailwind-классы перечислены явно, чтобы JIT не потерял их при сборке.
const BG_CLASS = {
  gray: 'bg-gray-100',
  red: 'bg-red-100',
  orange: 'bg-orange-100',
  amber: 'bg-amber-100',
  green: 'bg-green-100',
  teal: 'bg-teal-100',
  blue: 'bg-blue-100',
  indigo: 'bg-indigo-100',
  purple: 'bg-purple-100',
  pink: 'bg-pink-100',
};
const BORDER_CLASS = {
  gray: 'border-gray-300',
  red: 'border-red-300',
  orange: 'border-orange-300',
  amber: 'border-amber-300',
  green: 'border-green-300',
  teal: 'border-teal-300',
  blue: 'border-blue-300',
  indigo: 'border-indigo-300',
  purple: 'border-purple-300',
  pink: 'border-pink-300',
};
const TEXT_CLASS = {
  gray: 'text-gray-700',
  red: 'text-red-700',
  orange: 'text-orange-700',
  amber: 'text-amber-800',
  green: 'text-green-700',
  teal: 'text-teal-700',
  blue: 'text-blue-700',
  indigo: 'text-indigo-700',
  purple: 'text-purple-700',
  pink: 'text-pink-700',
};
const DOT_CLASS = {
  gray: 'bg-gray-400',
  red: 'bg-red-400',
  orange: 'bg-orange-400',
  amber: 'bg-amber-400',
  green: 'bg-green-400',
  teal: 'bg-teal-400',
  blue: 'bg-blue-400',
  indigo: 'bg-indigo-400',
  purple: 'bg-purple-400',
  pink: 'bg-pink-400',
};

export function tagClasses(color) {
  const c = TAG_COLORS.includes(color) ? color : 'gray';
  return `${BG_CLASS[c]} ${BORDER_CLASS[c]} ${TEXT_CLASS[c]}`;
}

export function tagDotClass(color) {
  const c = TAG_COLORS.includes(color) ? color : 'gray';
  return DOT_CLASS[c];
}

export default function Tag({ tag, size = 'sm' }) {
  if (!tag) return null;
  const padding = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';
  return (
    <span className={`inline-flex items-center gap-1 ${padding} border rounded ${tagClasses(tag.color)}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${tagDotClass(tag.color)}`} />
      <span className="truncate max-w-[140px]">{tag.name}</span>
    </span>
  );
}

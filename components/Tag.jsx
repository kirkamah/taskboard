'use client';

export const TAG_COLORS = ['gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink'];

// Colored dot used in tags and in the color picker. Stays a Tailwind utility —
// it's just a 1.5×1.5 round swatch with no text, so theme overrides don't hurt it.
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

export function tagDotClass(color) {
  const c = TAG_COLORS.includes(color) ? color : 'gray';
  return DOT_CLASS[c];
}

// Tag rendering uses a dedicated .tb-tag[data-color] rule in globals.css
// instead of Tailwind color utilities, so it's immune to the dark/cosmic
// theme overrides of .text-*-700/.bg-*-100 that otherwise lightened tag
// text to the point of illegibility on dark backgrounds.
export default function Tag({ tag, size = 'sm' }) {
  if (!tag) return null;
  const color = TAG_COLORS.includes(tag.color) ? tag.color : 'gray';
  const padding = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';
  return (
    <span data-color={color} className={`tb-tag inline-flex items-center gap-1 ${padding} rounded`}>
      <span className={`w-1.5 h-1.5 rounded-full ${tagDotClass(color)}`} />
      <span className="truncate max-w-[140px]">{tag.name}</span>
    </span>
  );
}

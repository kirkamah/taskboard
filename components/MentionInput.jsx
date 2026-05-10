'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Avatar from './Avatar';
import { formatMention } from '@/lib/mentions';

// Drop-in textarea wrapper that pops up a member picker when the user types
// `@`. Selecting a member inserts `[@Display Name](uuid)` so the Markdown
// renderer can later style it as a chip.
//
// Props mirror a regular <textarea> plus:
//   - members:  [{ user_id, ... }]
//   - profiles: { [user_id]: { display_name, ... } }
//
// If `members` is empty (personal scope), it behaves like a plain textarea.

const MENTION_TRIGGER = /(?:^|\s)(@[^\s@]*)$/u;

export default function MentionInput({ value, onChange, members = [], profiles = {}, ...rest }) {
  const ref = useRef(null);
  const [popup, setPopup] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const detect = useCallback(() => {
    const el = ref.current;
    if (!el || members.length === 0) { setPopup(null); return; }
    const cursor = el.selectionStart ?? 0;
    const before = (value || '').substring(0, cursor);
    const m = before.match(MENTION_TRIGGER);
    if (!m) { setPopup(null); return; }
    const trigger = m[1];
    const start = cursor - trigger.length;
    setPopup({ filter: trigger.slice(1).toLowerCase(), start, end: cursor });
    setActiveIdx(0);
  }, [value, members.length]);

  useEffect(() => { detect(); }, [detect]);

  const filtered = popup
    ? members
        .map((mem) => ({ mem, name: profiles[mem.user_id]?.display_name || '' }))
        .filter(({ name }) => !popup.filter || name.toLowerCase().includes(popup.filter))
        .slice(0, 6)
    : [];

  const insertAt = (mem) => {
    const name = profiles[mem.user_id]?.display_name || 'Пользователь';
    const before = (value || '').substring(0, popup.start);
    const after = (value || '').substring(popup.end);
    const insertion = formatMention(name, mem.user_id) + ' ';
    const next = before + insertion + after;
    onChange(next);
    setPopup(null);
    // Restore caret after the inserted mention on next tick.
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const pos = before.length + insertion.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e) => {
    if (rest.onKeyDown) rest.onKeyDown(e);
    if (!popup || filtered.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => (i + 1) % filtered.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertAt(filtered[activeIdx].mem); }
    else if (e.key === 'Escape') { e.preventDefault(); setPopup(null); }
  };

  const { onKeyDown: _ignore, ...restProps } = rest;

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyUp={detect}
        onClick={detect}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setPopup(null), 150)}
        {...restProps}
      />
      {popup && filtered.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-30 max-h-56 overflow-auto">
          {filtered.map(({ mem, name }, idx) => (
            <button
              key={mem.user_id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insertAt(mem); }}
              onMouseEnter={() => setActiveIdx(idx)}
              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${idx === activeIdx ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
            >
              <Avatar profile={profiles[mem.user_id] || null} />
              <span className="text-sm text-gray-900">{name || 'Пользователь'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

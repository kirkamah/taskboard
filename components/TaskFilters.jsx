'use client';

import { useState, useRef, useEffect } from 'react';
import { Filter, X, Check } from 'lucide-react';
import Tag from './Tag';
import Avatar from './Avatar';
import { DEFAULT_FILTERS, countActiveFilters } from '@/lib/taskFilters';

// Per-user view filters for the board. Selections persist via localStorage in
// the parent (BoardBody); this component only renders the UI and reports
// changes via onChange.
//
// Props:
//  - scope: 'personal' | 'room'  (assignee section is hidden on 'personal')
//  - filters: current filter object — see lib/taskFilters for shape
//  - onChange(nextFilters): called with the updated filters (whole object)
//  - members, profiles: room member list — only used in 'room' scope
//  - tags: tag list available in this scope (personal or room)
//  - userId: current user id, to render "Я" pill for assignee='me'
export default function TaskFilters({ scope, filters, onChange, members = [], profiles = {}, tags = [], userId }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (panelRef.current?.contains(e.target) || buttonRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const isRoom = scope === 'room';
  const active = countActiveFilters(filters);
  const tagsById = tags.reduce((acc, t) => { acc[t.id] = t; return acc; }, {});

  const set = (patch) => onChange({ ...filters, ...patch });
  const reset = () => onChange({ ...DEFAULT_FILTERS });

  const toggleTag = (tagId) => {
    const cur = filters.tagIds || [];
    const next = cur.includes(tagId) ? cur.filter((id) => id !== tagId) : [...cur, tagId];
    set({ tagIds: next, noTags: false });
  };

  const getName = (uid) => profiles[uid]?.display_name || 'Пользователь';

  // -- Active-filter chips (shown inline in the bar) --------------------------
  const chips = [];
  if (filters.assignee) {
    let label;
    if (filters.assignee === 'me') label = 'Я (назначено)';
    else if (filters.assignee === 'unassigned') label = 'Без назначения';
    else label = `Назначено: ${getName(filters.assignee)}`;
    chips.push({ key: 'assignee', label, clear: () => set({ assignee: null }) });
  }
  if (filters.noTags) {
    chips.push({ key: 'notags', label: 'Без тегов', clear: () => set({ noTags: false }) });
  } else if (filters.tagIds && filters.tagIds.length > 0) {
    const names = filters.tagIds.map((id) => tagsById[id]?.name).filter(Boolean);
    const label = names.length <= 2 ? `Теги: ${names.join(', ')}` : `Теги: ${names.slice(0, 2).join(', ')} +${names.length - 2}`;
    chips.push({ key: 'tags', label, clear: () => set({ tagIds: [] }) });
  }
  if (filters.due) {
    const DUE_LABELS = { overdue: 'Просрочено', today: 'Сегодня', week: 'На 7 дней', none: 'Без дедлайна', any: 'С дедлайном' };
    chips.push({ key: 'due', label: DUE_LABELS[filters.due] || filters.due, clear: () => set({ due: null }) });
  }
  if (filters.quadrant) {
    const QUAD_LABELS = { do: 'Важно и срочно', plan: 'Важно, не срочно', delegate: 'Не важно, срочно', drop: 'Не важно, не срочно' };
    chips.push({ key: 'quad', label: QUAD_LABELS[filters.quadrant] || filters.quadrant, clear: () => set({ quadrant: null }) });
  }

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <button
            ref={buttonRef}
            onClick={() => setOpen((o) => !o)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg ${active > 0 ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            <Filter size={14} />
            Фильтры
            {active > 0 && <span className="ml-0.5 text-xs opacity-80">({active})</span>}
          </button>

          {open && (
            <div
              ref={panelRef}
              className="absolute z-40 mt-2 left-0 w-[320px] bg-white border border-gray-200 rounded-lg shadow-lg p-4 space-y-4"
            >
              {isRoom && (
                <FilterSection title="Назначено">
                  <PickPill active={filters.assignee === 'me'} onClick={() => set({ assignee: filters.assignee === 'me' ? null : 'me' })}>На меня</PickPill>
                  <PickPill active={filters.assignee === 'unassigned'} onClick={() => set({ assignee: filters.assignee === 'unassigned' ? null : 'unassigned' })}>Без назначения</PickPill>
                  {members.filter((m) => m.user_id !== userId).map((m) => (
                    <PickPill
                      key={m.user_id}
                      active={filters.assignee === m.user_id}
                      onClick={() => set({ assignee: filters.assignee === m.user_id ? null : m.user_id })}
                    >
                      <span className="inline-flex items-center gap-1">
                        <Avatar profile={profiles[m.user_id]} />
                        {getName(m.user_id)}
                      </span>
                    </PickPill>
                  ))}
                </FilterSection>
              )}

              <FilterSection title="Теги">
                {tags.length === 0 ? (
                  <span className="text-xs text-gray-400">В этом контексте тегов пока нет.</span>
                ) : (
                  <>
                    {tags.map((t) => {
                      const selected = (filters.tagIds || []).includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleTag(t.id)}
                          className={`inline-flex items-center gap-1 border rounded-full px-0.5 py-0.5 ${selected ? 'border-gray-900' : 'border-transparent'}`}
                        >
                          <Tag tag={t} />
                          {selected && <Check size={12} className="text-gray-900 mr-1" />}
                        </button>
                      );
                    })}
                    <PickPill active={filters.noTags} onClick={() => set({ noTags: !filters.noTags, tagIds: [] })}>Без тегов</PickPill>
                  </>
                )}
              </FilterSection>

              <FilterSection title="Дедлайн">
                <PickPill active={filters.due === 'overdue'} onClick={() => set({ due: filters.due === 'overdue' ? null : 'overdue' })}>Просрочено</PickPill>
                <PickPill active={filters.due === 'today'} onClick={() => set({ due: filters.due === 'today' ? null : 'today' })}>Сегодня</PickPill>
                <PickPill active={filters.due === 'week'} onClick={() => set({ due: filters.due === 'week' ? null : 'week' })}>Ближайшие 7 дней</PickPill>
                <PickPill active={filters.due === 'any'} onClick={() => set({ due: filters.due === 'any' ? null : 'any' })}>С дедлайном</PickPill>
                <PickPill active={filters.due === 'none'} onClick={() => set({ due: filters.due === 'none' ? null : 'none' })}>Без дедлайна</PickPill>
              </FilterSection>

              <FilterSection title="Квадрант">
                <PickPill active={filters.quadrant === 'do'} onClick={() => set({ quadrant: filters.quadrant === 'do' ? null : 'do' })}>Важно и срочно</PickPill>
                <PickPill active={filters.quadrant === 'plan'} onClick={() => set({ quadrant: filters.quadrant === 'plan' ? null : 'plan' })}>Важно, не срочно</PickPill>
                <PickPill active={filters.quadrant === 'delegate'} onClick={() => set({ quadrant: filters.quadrant === 'delegate' ? null : 'delegate' })}>Не важно, срочно</PickPill>
                <PickPill active={filters.quadrant === 'drop'} onClick={() => set({ quadrant: filters.quadrant === 'drop' ? null : 'drop' })}>Не важно, не срочно</PickPill>
              </FilterSection>

              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <button type="button" onClick={reset} className="text-xs text-gray-500 hover:text-gray-900" disabled={active === 0}>
                  Сбросить всё
                </button>
                <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-700 hover:text-gray-900">
                  Готово
                </button>
              </div>
            </div>
          )}
        </div>

        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={c.clear}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200"
            title="Убрать фильтр"
          >
            {c.label}
            <X size={12} />
          </button>
        ))}

        {active > 0 && (
          <button type="button" onClick={reset} className="text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2">
            Сбросить
          </button>
        )}
      </div>
    </div>
  );
}

function FilterSection({ title, children }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">{title}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function PickPill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border ${active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
    >
      {children}
    </button>
  );
}

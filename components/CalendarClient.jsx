'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// Month grid showing all tasks with due_at the user can read (personal +
// rooms they're in). Click a cell to focus a day; click a task to jump to
// its board.
//
// Week starts Monday (Russian convention). Cells span the previous/next
// month padding so the grid is always 6 rows.

const RU_MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const RU_WEEK = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
// Monday-aligned start of the calendar grid for the given month.
function gridStart(d) {
  const first = startOfMonth(d);
  const dow = first.getDay(); // 0=Sun..6=Sat
  const offset = (dow + 6) % 7; // turn into 0=Mon..6=Sun
  return new Date(first.getFullYear(), first.getMonth(), 1 - offset);
}
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function quadrantClasses(important, urgent) {
  if (important && urgent) return 'bg-red-100 text-red-800';
  if (important) return 'bg-amber-100 text-amber-800';
  if (urgent) return 'bg-blue-100 text-blue-800';
  return 'bg-gray-100 text-gray-700';
}

export default function CalendarClient({ userId }) {
  const supabase = createClient();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [tasks, setTasks] = useState([]);
  const [rooms, setRooms] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);

  const monthStart = useMemo(() => startOfMonth(cursor), [cursor]);
  const monthEnd = useMemo(() => addMonths(cursor, 1), [cursor]);
  const start = useMemo(() => gridStart(cursor), [cursor]);

  const cells = useMemo(() => {
    const out = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      out.push(d);
    }
    return out;
  }, [start]);

  const load = useCallback(async () => {
    setLoading(true);
    // Membership lookup → which room tasks the user can see.
    const { data: memberships } = await supabase
      .from('room_members')
      .select('room_id')
      .eq('user_id', userId);
    const roomIds = (memberships || []).map(m => m.room_id);

    // Fetch room metadata for navigation labels.
    if (roomIds.length > 0) {
      const { data: roomRows } = await supabase
        .from('rooms')
        .select('id, name')
        .in('id', roomIds);
      const map = {};
      (roomRows || []).forEach(r => { map[r.id] = r.name; });
      setRooms(map);
    } else {
      setRooms({});
    }

    // Window the query by visible grid (start..start+42 days) so we don't
    // hammer the DB when the user paginates months.
    const queryStart = new Date(start);
    const queryEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 42);

    const personalQ = supabase
      .from('tasks')
      .select('id, title, important, urgent, due_at, done, owner_id, room_id, archived_at')
      .eq('owner_id', userId)
      .is('room_id', null)
      .is('archived_at', null)
      .gte('due_at', queryStart.toISOString())
      .lt('due_at', queryEnd.toISOString());

    const roomQ = roomIds.length > 0
      ? supabase
          .from('tasks')
          .select('id, title, important, urgent, due_at, done, owner_id, room_id, archived_at')
          .in('room_id', roomIds)
          .is('archived_at', null)
          .gte('due_at', queryStart.toISOString())
          .lt('due_at', queryEnd.toISOString())
      : Promise.resolve({ data: [] });

    const [{ data: personal }, { data: roomTasks }] = await Promise.all([personalQ, roomQ]);
    setTasks([...(personal || []), ...(roomTasks || [])]);
    setLoading(false);
  }, [supabase, userId, start]);

  useEffect(() => { load(); }, [load]);

  // Group tasks by YMD for fast cell lookup.
  const tasksByDay = useMemo(() => {
    const map = {};
    for (const t of tasks) {
      const key = ymd(new Date(t.due_at));
      (map[key] = map[key] || []).push(t);
    }
    return map;
  }, [tasks]);

  const today = ymd(new Date());
  const monthLabel = `${RU_MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;

  const taskHref = (t) => t.room_id ? `/room/${t.room_id}` : '/my-board';

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setCursor(addMonths(cursor, -1))} className="p-1.5 border border-gray-300 rounded-md bg-white hover:bg-gray-50">
          <ChevronLeft size={16} />
        </button>
        <button onClick={() => setCursor(addMonths(cursor, 1))} className="p-1.5 border border-gray-300 rounded-md bg-white hover:bg-gray-50">
          <ChevronRight size={16} />
        </button>
        <button onClick={() => setCursor(startOfMonth(new Date()))} className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 inline-flex items-center gap-1">
          <CalendarIcon size={14} /> Сегодня
        </button>
        <h2 className="ml-2 text-lg font-semibold text-gray-900">{monthLabel}</h2>
        {loading && <span className="text-xs text-gray-400 ml-2">Загрузка…</span>}
      </div>

      <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
        {RU_WEEK.map((w) => (
          <div key={w} className="bg-gray-50 px-2 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide text-center">{w}</div>
        ))}
        {cells.map((d) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const key = ymd(d);
          const isToday = key === today;
          const isSelected = selectedDay === key;
          const dayTasks = tasksByDay[key] || [];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedDay(isSelected ? null : key)}
              className={`bg-white p-1.5 min-h-[88px] text-left flex flex-col gap-1 ${inMonth ? '' : 'opacity-40'} ${isSelected ? 'ring-2 ring-gray-900 ring-inset' : ''}`}
            >
              <span className={`text-xs ${isToday ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-900 text-white' : 'text-gray-700'}`}>
                {d.getDate()}
              </span>
              <div className="flex-1 space-y-0.5 overflow-hidden">
                {dayTasks.slice(0, 3).map((t) => (
                  <div
                    key={t.id}
                    title={t.title}
                    className={`text-[11px] leading-tight px-1 py-0.5 rounded truncate ${quadrantClasses(t.important, t.urgent)} ${t.done ? 'line-through opacity-60' : ''}`}
                  >
                    {t.title}
                  </div>
                ))}
                {dayTasks.length > 3 && (
                  <div className="text-[11px] text-gray-500 px-1">+ ещё {dayTasks.length - 3}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-2">
            {new Date(selectedDay).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
          </h3>
          {(tasksByDay[selectedDay] || []).length === 0 ? (
            <p className="text-sm text-gray-500">Задач на этот день нет.</p>
          ) : (
            <div className="space-y-2">
              {(tasksByDay[selectedDay] || []).map((t) => (
                <Link
                  key={t.id}
                  href={taskHref(t)}
                  className="flex items-center justify-between border border-gray-200 rounded-md p-2 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`inline-block w-2 h-2 rounded-full ${quadrantClasses(t.important, t.urgent).split(' ')[0]}`} />
                    <span className={`text-sm truncate ${t.done ? 'line-through text-gray-400' : 'text-gray-900'}`}>{t.title}</span>
                  </div>
                  <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
                    {t.room_id ? rooms[t.room_id] || 'Комната' : 'Личная'}
                    {' · '}
                    {new Date(t.due_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, Square, Timer } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// One global timer at a time, identified by taskId. State is in localStorage
// so the timer keeps running across modal close / page navigation.
//
// Phases:
//   focus  — 25 min; on completion, server's time_spent_minutes += 25
//   break  — 5 min; no DB write
//
// Manual stop discards the current phase (no minutes credited).

const FOCUS_MINUTES = 25;
const BREAK_MINUTES = 5;
const STORAGE_KEY = 'taskboard:pomodoro:v1';

function loadActive() {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null'); }
  catch { return null; }
}

function saveActive(state) {
  if (typeof window === 'undefined') return;
  if (state) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  else window.localStorage.removeItem(STORAGE_KEY);
}

export default function PomodoroTimer({ taskId, initialSpentMinutes = 0, canEdit = true }) {
  const supabase = createClient();
  const [active, setActive] = useState(() => loadActive());
  const [now, setNow] = useState(() => Date.now());
  const [spent, setSpent] = useState(initialSpentMinutes);
  const finalizedRef = useRef(false);

  // Sync localStorage and tick every second while a timer is running.
  useEffect(() => {
    saveActive(active);
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  useEffect(() => { setSpent(initialSpentMinutes); }, [initialSpentMinutes, taskId]);

  const isOurs = active && active.taskId === taskId;
  const otherTaskRunning = active && active.taskId !== taskId;

  const phaseDurationMs = (phase) => (phase === 'focus' ? FOCUS_MINUTES : BREAK_MINUTES) * 60 * 1000;
  const remainingMs = isOurs ? Math.max(0, active.startedAt + phaseDurationMs(active.phase) - now) : 0;

  // When the timer hits zero, credit minutes (focus only) and switch to break.
  useEffect(() => {
    if (!isOurs || remainingMs > 0 || finalizedRef.current) return;
    finalizedRef.current = true;
    (async () => {
      if (active.phase === 'focus') {
        const next = spent + FOCUS_MINUTES;
        setSpent(next);
        await supabase.from('tasks').update({ time_spent_minutes: next }).eq('id', taskId);
        // Auto-roll into a break.
        const breakState = { taskId, startedAt: Date.now(), phase: 'break' };
        setActive(breakState);
      } else {
        setActive(null);
      }
      finalizedRef.current = false;
    })();
  }, [isOurs, remainingMs, active, spent, taskId, supabase]);

  const start = () => {
    setActive({ taskId, startedAt: Date.now(), phase: 'focus' });
  };
  const stop = () => {
    setActive(null);
  };

  const fmt = (ms) => {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const fmtSpent = () => {
    if (spent < 60) return `${spent} мин`;
    const h = Math.floor(spent / 60);
    const m = spent % 60;
    return `${h} ч ${m ? `${m} мин` : ''}`.trim();
  };

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <p className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-2">
        <Timer size={12} /> Pomodoro
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        {isOurs ? (
          <>
            <span className={`px-2 py-1 rounded text-sm font-mono ${active.phase === 'focus' ? 'bg-gray-900 text-white' : 'bg-green-100 text-green-800'}`}>
              {active.phase === 'focus' ? 'Фокус' : 'Перерыв'} · {fmt(remainingMs)}
            </span>
            <button onClick={stop} className="px-2.5 py-1 text-xs border border-gray-300 rounded-md bg-white hover:bg-gray-50 inline-flex items-center gap-1">
              <Square size={12} /> Стоп
            </button>
          </>
        ) : otherTaskRunning ? (
          <span className="text-xs text-gray-500">Идёт таймер на другой задаче.</span>
        ) : (
          canEdit && (
            <button onClick={start} className="px-2.5 py-1 text-xs border border-gray-300 rounded-md bg-white hover:bg-gray-50 inline-flex items-center gap-1">
              <Play size={12} /> Начать (25 мин)
            </button>
          )
        )}
        <span className="text-xs text-gray-500">Накоплено: <strong className="text-gray-800">{fmtSpent()}</strong></span>
      </div>
    </div>
  );
}

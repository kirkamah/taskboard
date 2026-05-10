import Link from 'next/link';
import { ArrowLeft, BarChart3, Flame, Trophy, CheckCircle2, Archive as ArchiveIcon, ListTodo } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import Navbar from '@/components/Navbar';
import Tag from '@/components/Tag';

export const dynamic = 'force-dynamic';

// Server-rendered stats page. Pulls everything per-user across personal +
// rooms the user is in. Streaks are computed in JS from a list of completion
// days; the chart is a simple SVG bar series.

function startOfUTC(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function ymdUTC(d) {
  return d.toISOString().slice(0, 10);
}

function computeStreaks(daysWithCompletion) {
  // daysWithCompletion: Set<'YYYY-MM-DD'>
  if (daysWithCompletion.size === 0) return { current: 0, longest: 0 };
  // Current streak: walk back from today as long as the day is present.
  let current = 0;
  const today = startOfUTC(new Date());
  for (let i = 0; ; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    if (daysWithCompletion.has(ymdUTC(d))) current++;
    else break;
  }
  // Longest streak: scan all dates sorted.
  const sorted = [...daysWithCompletion].sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const ds of sorted) {
    if (prev) {
      const gap = (Date.parse(ds) - Date.parse(prev)) / 86400000;
      if (gap === 1) run++; else run = 1;
    } else run = 1;
    if (run > longest) longest = run;
    prev = ds;
  }
  return { current, longest };
}

export default async function StatsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_emoji, avatar_color')
    .eq('id', user.id)
    .single();
  const userName = profile?.display_name || user.email.split('@')[0];

  // Rooms the user can read tasks from.
  const { data: memberships } = await supabase
    .from('room_members')
    .select('room_id')
    .eq('user_id', user.id);
  const roomIds = (memberships || []).map((m) => m.room_id);

  // Totals — personal + room tasks the user can see.
  let personalActive = 0, personalDone = 0, personalArchived = 0;
  let roomActive = 0, roomDone = 0, roomArchived = 0;
  {
    const { data: personal } = await supabase
      .from('tasks')
      .select('done, archived_at')
      .eq('owner_id', user.id)
      .is('room_id', null)
      .is('parent_task_id', null);
    for (const t of personal || []) {
      if (t.archived_at) personalArchived++;
      else if (t.done) personalDone++;
      else personalActive++;
    }
  }
  if (roomIds.length > 0) {
    const { data: roomTasks } = await supabase
      .from('tasks')
      .select('done, archived_at')
      .in('room_id', roomIds)
      .is('parent_task_id', null);
    for (const t of roomTasks || []) {
      if (t.archived_at) roomArchived++;
      else if (t.done) roomDone++;
      else roomActive++;
    }
  }

  // Completion events for last 90 days (for streak) and last 30 (for chart).
  const since90 = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data: events } = await supabase
    .from('task_events')
    .select('created_at, payload')
    .eq('actor_id', user.id)
    .eq('kind', 'task_updated')
    .gte('created_at', since90)
    .limit(2000);

  const completionDays = new Set();
  for (const e of events || []) {
    const done = e.payload?.done;
    if (Array.isArray(done) && done[0] === false && done[1] === true) {
      completionDays.add(ymdUTC(new Date(e.created_at)));
    }
  }
  const { current, longest } = computeStreaks(completionDays);

  // 30-day chart: count completions per day, oldest → newest.
  const days30 = [];
  const today = startOfUTC(new Date());
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    days30.push({ key: ymdUTC(d), label: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }), count: 0 });
  }
  for (const e of events || []) {
    const done = e.payload?.done;
    if (!(Array.isArray(done) && done[0] === false && done[1] === true)) continue;
    const key = ymdUTC(new Date(e.created_at));
    const cell = days30.find((d) => d.key === key);
    if (cell) cell.count++;
  }
  const maxCount = Math.max(1, ...days30.map((d) => d.count));
  const total30 = days30.reduce((a, d) => a + d.count, 0);

  // Top 5 tags by usage on the user's visible tasks.
  // Done in two queries because Supabase select + filter on joined table is awkward.
  const { data: ownTagsTasks } = await supabase
    .from('tasks')
    .select('id, owner_id, room_id')
    .or(`owner_id.eq.${user.id}${roomIds.length > 0 ? `,room_id.in.(${roomIds.join(',')})` : ''}`)
    .is('archived_at', null);
  const visibleTaskIds = (ownTagsTasks || []).map((t) => t.id);
  let topTags = [];
  if (visibleTaskIds.length > 0) {
    const { data: links } = await supabase
      .from('task_tags')
      .select('tag_id')
      .in('task_id', visibleTaskIds);
    const counts = new Map();
    for (const l of links || []) counts.set(l.tag_id, (counts.get(l.tag_id) || 0) + 1);
    const top5 = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (top5.length > 0) {
      const { data: tagRows } = await supabase
        .from('room_tags')
        .select('id, name, color')
        .in('id', top5.map(([id]) => id));
      const byId = Object.fromEntries((tagRows || []).map((t) => [t.id, t]));
      topTags = top5.map(([id, count]) => ({ ...byId[id], count })).filter((t) => t.id);
    }
  }

  return (
    <>
      <Navbar userName={userName} userId={user.id} userProfile={profile} />
      <div className="max-w-5xl mx-auto px-6 py-6">
        <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1 mb-2">
          <ArrowLeft size={16} /> На главную
        </Link>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2"><BarChart3 size={22} /> Статистика</h1>
          <p className="text-sm text-gray-500 mt-1">По всем твоим задачам — личным и из комнат</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard icon={<Flame size={16} />} title="Текущая серия" value={`${current} ${plural(current, ['день', 'дня', 'дней'])}`} hint="дней подряд с выполнением" />
          <StatCard icon={<Trophy size={16} />} title="Лучшая серия" value={`${longest} ${plural(longest, ['день', 'дня', 'дней'])}`} hint="за последние 90 дней" />
          <StatCard icon={<CheckCircle2 size={16} />} title="Выполнено за 30 дней" value={String(total30)} hint="по событиям" />
          <StatCard icon={<ListTodo size={16} />} title="Активных задач" value={String(personalActive + roomActive)} hint={`${personalActive} личных + ${roomActive} в комнатах`} />
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <h2 className="font-semibold text-gray-900 mb-3">Выполнения за 30 дней</h2>
          <div className="flex items-end gap-1 h-32 mt-2">
            {days30.map((d) => (
              <div key={d.key} className="flex-1 flex flex-col items-center justify-end" title={`${d.label} — ${d.count}`}>
                <div className="w-full bg-gray-900 rounded-t" style={{ height: `${(d.count / maxCount) * 100}%`, minHeight: d.count > 0 ? 2 : 0 }} />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{days30[0].label}</span>
            <span>{days30[days30.length - 1].label}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="font-semibold text-gray-900 mb-3">По разделам</h2>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-500"><th className="text-left font-medium pb-1"></th><th className="text-right font-medium pb-1">Активные</th><th className="text-right font-medium pb-1">Выполнено</th><th className="text-right font-medium pb-1">В архиве</th></tr></thead>
              <tbody>
                <tr className="border-t border-gray-100"><td className="py-1.5 text-gray-700">Личные</td><td className="text-right">{personalActive}</td><td className="text-right">{personalDone}</td><td className="text-right">{personalArchived}</td></tr>
                <tr className="border-t border-gray-100"><td className="py-1.5 text-gray-700">Комнаты</td><td className="text-right">{roomActive}</td><td className="text-right">{roomDone}</td><td className="text-right">{roomArchived}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="font-semibold text-gray-900 mb-3">Часто используемые теги</h2>
            {topTags.length === 0 ? (
              <p className="text-sm text-gray-500">Пока ничего не помечено тегами.</p>
            ) : (
              <ul className="space-y-2">
                {topTags.map((t) => (
                  <li key={t.id} className="flex items-center justify-between">
                    <Tag tag={t} />
                    <span className="text-sm text-gray-500">{t.count} {plural(t.count, ['задача', 'задачи', 'задач'])}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function StatCard({ icon, title, value, hint }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1.5">{icon}{title}</div>
      <div className="text-2xl font-semibold text-gray-900 mt-1">{value}</div>
      {hint && <div className="text-xs text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );
}

function plural(n, forms) {
  const tens = Math.floor((n % 100) / 10);
  const last = n % 10;
  if (tens === 1) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

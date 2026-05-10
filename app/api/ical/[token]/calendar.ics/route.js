import { createAdminClient } from '@/lib/supabase/admin';

// Public iCal feed for a single user. Clients (Google Calendar, Apple
// Calendar) subscribe to the URL — they re-fetch periodically, so we
// rebuild the body on every hit.
//
// The path token authorizes access; rotating it via the profile page
// instantly breaks existing subscriptions.

export const dynamic = 'force-dynamic';

const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || 'https://taskboard.example';

export async function GET(_request, { params }) {
  const token = params?.token;
  if (!token || token.length < 16) {
    return new Response('Not Found', { status: 404 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id, display_name, ical_token')
    .eq('ical_token', token)
    .maybeSingle();

  if (!profile) {
    return new Response('Not Found', { status: 404 });
  }

  const userId = profile.id;

  // Rooms the user is a member of.
  const { data: memberships } = await admin
    .from('room_members')
    .select('room_id')
    .eq('user_id', userId);
  const roomIds = (memberships || []).map((m) => m.room_id);

  // Personal tasks with a due date.
  const { data: personal } = await admin
    .from('tasks')
    .select('id, title, description, due_at, done, archived_at, room_id, owner_id')
    .eq('owner_id', userId)
    .is('room_id', null)
    .is('archived_at', null)
    .not('due_at', 'is', null);

  let roomTasks = [];
  if (roomIds.length > 0) {
    const { data } = await admin
      .from('tasks')
      .select('id, title, description, due_at, done, archived_at, room_id, owner_id')
      .in('room_id', roomIds)
      .is('archived_at', null)
      .not('due_at', 'is', null);
    roomTasks = data || [];
  }

  const tasks = [...(personal || []), ...roomTasks];

  const body = buildIcal(tasks, profile.display_name || 'Taskboard');

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Disposition': 'inline; filename="taskboard.ics"',
    },
  });
}

function buildIcal(tasks, ownerName) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Taskboard//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Taskboard — ${escapeText(ownerName)}`,
    'X-WR-TIMEZONE:UTC',
  ];

  const now = formatIcsDateTime(new Date());
  for (const task of tasks) {
    const due = new Date(task.due_at);
    const dtStart = formatIcsDateTime(due);
    const dtEnd = formatIcsDateTime(new Date(due.getTime() + 30 * 60 * 1000)); // 30-min slot
    const taskUrl = `${ORIGIN}/${task.room_id ? `room/${task.room_id}` : 'my-board'}`;
    const summary = (task.done ? '[x] ' : '') + (task.title || 'Task');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${task.id}@taskboard`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART:${dtStart}`);
    lines.push(`DTEND:${dtEnd}`);
    lines.push(`SUMMARY:${escapeText(summary)}`);
    if (task.description) lines.push(`DESCRIPTION:${escapeText(task.description)}`);
    lines.push(`URL:${taskUrl}`);
    lines.push(`STATUS:${task.done ? 'COMPLETED' : 'CONFIRMED'}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

function formatIcsDateTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function escapeText(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

// RFC 5545 line folding: max 75 octets, continuation lines start with a space.
function foldLine(line) {
  if (line.length <= 75) return line;
  const chunks = [];
  let i = 0;
  chunks.push(line.slice(0, 75));
  i = 75;
  while (i < line.length) {
    chunks.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return chunks.join('\r\n');
}

// Authorization helpers shared across /api/v1 routes. Since RLS is permissive
// project-wide, these checks are the real access control boundary.

import { hasPermission } from './permissions.js';

export async function getMyRoomRole(supabase, roomId, userId) {
  const { data } = await supabase
    .from('room_members')
    .select('role')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();
  return data?.role || null;
}

// Enriched member with role_data so hasPermission() sees the full picture.
// Returns null if the user isn't in the room. For owners role_id is null and
// the lookup is skipped — hasPermission short-circuits on role='owner' anyway.
export async function getMyRoomMember(supabase, roomId, userId) {
  const { data: member } = await supabase
    .from('room_members')
    .select('role, role_id')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!member) return null;
  let role_data = null;
  if (member.role_id) {
    const { data: role } = await supabase
      .from('room_roles')
      .select('id, name, permissions')
      .eq('id', member.role_id)
      .maybeSingle();
    role_data = role || null;
  }
  return { role: member.role, role_id: member.role_id, role_data };
}

// Returns the task row (with room context) when the user may read it, or null
// if it doesn't exist / user has no access.
export async function loadReadableTask(supabase, taskId, userId) {
  const { data: task } = await supabase
    .from('tasks')
    .select('id, owner_id, room_id, title, description, important, urgent, done, created_at, due_at, created_by_api_key_id')
    .eq('id', taskId)
    .maybeSingle();
  if (!task) return { task: null, role: null };

  if (task.room_id === null) {
    // Personal task: only the owner may read.
    if (task.owner_id !== userId) return { task: null, role: null };
    return { task, role: 'personal' };
  }

  const role = await getMyRoomRole(supabase, task.room_id, userId);
  if (!role) return { task: null, role: null };
  return { task, role };
}

// Same as loadReadableTask but also hydrates an enriched member object so
// callers can ask hasPermission(member, 'edit_any_task') etc. For personal
// tasks the member is a synthetic { role: 'personal' } marker that the
// can*Task helpers below recognise.
export async function loadReadableTaskForWrite(supabase, taskId, userId) {
  const { task, role } = await loadReadableTask(supabase, taskId, userId);
  if (!task) return { task: null, member: null, role: null };
  if (role === 'personal') {
    return { task, member: { role: 'personal' }, role };
  }
  const member = await getMyRoomMember(supabase, task.room_id, userId);
  if (!member) return { task: null, member: null, role: null };
  return { task, member, role };
}

// Personal tasks are always editable by their owner. Otherwise defer to the
// per-permission flags on the caller's role.
export function canEditTask(member) {
  if (!member) return false;
  if (member.role === 'personal') return true;
  return hasPermission(member, 'edit_any_task');
}

export function canDeleteTask(member) {
  if (!member) return false;
  if (member.role === 'personal') return true;
  return hasPermission(member, 'delete_any_task');
}

export function canCreateRoomTask(member) {
  if (!member) return false;
  return hasPermission(member, 'create_tasks');
}

// Generates an 8-char room code using the same alphabet as the UI (DashboardClient).
export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Shape a raw task row into the public API response shape.
export function serializeTask(t) {
  return {
    id: t.id,
    title: t.title,
    description: t.description || '',
    important: !!t.important,
    urgent: !!t.urgent,
    done: !!t.done,
    room_id: t.room_id,
    owner_id: t.owner_id,
    due_at: t.due_at,
    created_at: t.created_at,
    created_by_api_key_id: t.created_by_api_key_id || null
  };
}

export function serializeRoom(r, role) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    owner_id: r.owner_id,
    created_at: r.created_at,
    my_role: role || null
  };
}

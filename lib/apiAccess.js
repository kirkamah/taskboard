// Authorization helpers shared across /api/v1 routes. Since RLS is permissive
// project-wide, these checks are the real access control boundary.

export async function getMyRoomRole(supabase, roomId, userId) {
  const { data } = await supabase
    .from('room_members')
    .select('role')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();
  return data?.role || null;
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

export function canWriteWithRole(role) {
  // 'personal' = user's own personal task. 'owner'/'editor' can write in a room.
  return role === 'personal' || role === 'owner' || role === 'editor';
}

// Generates a 8-char room code using the same alphabet as the UI (DashboardClient).
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

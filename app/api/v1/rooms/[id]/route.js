import { authenticateApiRequest, apiError, apiOk } from '@/lib/apiAuth';
import { getMyRoomRole, serializeRoom } from '@/lib/apiAccess';

export const dynamic = 'force-dynamic';

async function loadRoomForUser(supabase, roomId, userId) {
  const role = await getMyRoomRole(supabase, roomId, userId);
  if (!role) return { room: null, role: null };
  const { data: room } = await supabase
    .from('rooms')
    .select('id, code, name, owner_id, created_at')
    .eq('id', roomId)
    .maybeSingle();
  return { room, role };
}

export async function GET(request, { params }) {
  const auth = await authenticateApiRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  const { room, role } = await loadRoomForUser(supabase, params.id, userId);
  if (!room) return apiError(404, 'not_found', 'Room not found');
  return apiOk({ room: serializeRoom(room, role) });
}

export async function PATCH(request, { params }) {
  const auth = await authenticateApiRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  let body;
  try { body = await request.json(); } catch {
    return apiError(400, 'invalid_json', 'Request body must be valid JSON');
  }

  const { room, role } = await loadRoomForUser(supabase, params.id, userId);
  if (!room) return apiError(404, 'not_found', 'Room not found');
  if (role !== 'owner') return apiError(403, 'forbidden', 'Only the owner can rename a room');

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return apiError(400, 'missing_name', 'name is required');
  if (name.length > 200) return apiError(400, 'name_too_long', 'name must be 200 characters or fewer');

  const { data, error } = await supabase
    .from('rooms')
    .update({ name })
    .eq('id', room.id)
    .select('id, code, name, owner_id, created_at')
    .single();
  if (error) return apiError(500, 'db_error', error.message);
  return apiOk({ room: serializeRoom(data, role) });
}

export async function DELETE(request, { params }) {
  const auth = await authenticateApiRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  const { room, role } = await loadRoomForUser(supabase, params.id, userId);
  if (!room) return apiError(404, 'not_found', 'Room not found');
  if (role !== 'owner') return apiError(403, 'forbidden', 'Only the owner can delete a room');

  // Delete dependent rows first — the existing schema doesn't set ON DELETE CASCADE
  // on every FK, so we clean up manually. Tasks → task_assignees / task_tags /
  // task_checklist_items / task_completion_requests / notifications cascade
  // from tasks; rooms → room_members / notifications(room_id) / room_tags we
  // handle explicitly.
  await supabase.from('notifications').delete().eq('room_id', room.id);
  await supabase.from('tasks').delete().eq('room_id', room.id);
  await supabase.from('room_tags').delete().eq('room_id', room.id);
  await supabase.from('room_members').delete().eq('room_id', room.id);
  const { error } = await supabase.from('rooms').delete().eq('id', room.id);
  if (error) return apiError(500, 'db_error', error.message);
  return apiOk({ deleted: true });
}

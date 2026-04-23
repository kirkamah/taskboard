import { authenticateApiRequest, apiError, apiOk } from '@/lib/apiAuth';
import { generateRoomCode, serializeRoom } from '@/lib/apiAccess';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await authenticateApiRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  const { data: memberships, error } = await supabase
    .from('room_members')
    .select('role, rooms(id, code, name, owner_id, created_at)')
    .eq('user_id', userId);

  if (error) return apiError(500, 'db_error', error.message);

  const rooms = (memberships || [])
    .filter(m => m.rooms)
    .map(m => serializeRoom(m.rooms, m.role));

  return apiOk({ rooms });
}

export async function POST(request) {
  const auth = await authenticateApiRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  let body;
  try { body = await request.json(); } catch {
    return apiError(400, 'invalid_json', 'Request body must be valid JSON');
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return apiError(400, 'missing_name', 'name is required');
  if (name.length > 200) return apiError(400, 'name_too_long', 'name must be 200 characters or fewer');

  // Retry up to 3 times in case of a code collision (8-char space is large enough
  // that this is basically unreachable, but the UI already does this dance so we
  // match its behavior).
  let created = null;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    const code = generateRoomCode();
    const { data, error } = await supabase
      .from('rooms')
      .insert({ code, name, owner_id: userId })
      .select('id, code, name, owner_id, created_at')
      .single();
    if (!error) created = data;
    // On unique-violation (code collision) Postgres returns 23505; any other
    // error means something is genuinely wrong and we should surface it.
    else if (error.code && error.code !== '23505') {
      return apiError(500, 'db_error', error.message);
    }
  }
  if (!created) return apiError(500, 'code_collision', 'Failed to allocate a unique room code, please retry');

  const { error: memberError } = await supabase
    .from('room_members')
    .insert({ room_id: created.id, user_id: userId, role: 'owner' });
  if (memberError) return apiError(500, 'db_error', memberError.message);

  return apiOk({ room: serializeRoom(created, 'owner') }, 201);
}

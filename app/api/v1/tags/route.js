import { authenticateApiRequest, apiError, apiOk } from '@/lib/apiAuth';
import { getMyRoomMember, canManageTag, serializeTag } from '@/lib/apiAccess';

export const dynamic = 'force-dynamic';

// Kept in sync with components/Tag.jsx TAG_COLORS.
const TAG_COLORS = ['gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink'];
const MAX_NAME_LENGTH = 24;

export async function GET(request) {
  const auth = await authenticateApiRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('room_id');

  let q = supabase
    .from('room_tags')
    .select('id, name, color, room_id, owner_id, created_at')
    .order('name', { ascending: true });

  if (roomId) {
    const member = await getMyRoomMember(supabase, roomId, userId);
    if (!member) return apiError(404, 'not_found', 'Room not found or you are not a member');
    q = q.eq('room_id', roomId);
  } else {
    q = q.eq('owner_id', userId).is('room_id', null);
  }

  const { data, error } = await q;
  if (error) return apiError(500, 'db_error', error.message);
  return apiOk({ tags: (data || []).map(serializeTag) });
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
  if (name.length > MAX_NAME_LENGTH) return apiError(400, 'name_too_long', `name must be ${MAX_NAME_LENGTH} characters or fewer`);

  const color = body.color === undefined ? 'gray' : body.color;
  if (!TAG_COLORS.includes(color)) {
    return apiError(400, 'invalid_color', `color must be one of: ${TAG_COLORS.join(', ')}`);
  }

  const roomId = body.room_id || null;
  let scope, member = null;
  if (roomId) {
    member = await getMyRoomMember(supabase, roomId, userId);
    if (!member) return apiError(404, 'not_found', 'Room not found or you are not a member');
    scope = 'room';
  } else {
    scope = 'personal';
  }
  if (!canManageTag(scope, member)) {
    return apiError(403, 'forbidden', 'You do not have permission to create tags in this room');
  }

  const payload = scope === 'room'
    ? { room_id: roomId, owner_id: null, name, color }
    : { room_id: null, owner_id: userId, name, color };

  const { data, error } = await supabase
    .from('room_tags')
    .insert(payload)
    .select('id, name, color, room_id, owner_id, created_at')
    .single();

  if (error) {
    if (error.code === '23505') return apiError(409, 'tag_exists', 'A tag with this name already exists in this scope');
    return apiError(500, 'db_error', error.message);
  }
  return apiOk({ tag: serializeTag(data) }, 201);
}

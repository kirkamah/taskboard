import { authenticateApiRequest, apiError, apiOk } from '@/lib/apiAuth';
import { getMyRoomRole, canWriteWithRole, serializeTask } from '@/lib/apiAccess';

export const dynamic = 'force-dynamic';

const MAX_LIMIT = 200;

function parseBoolParam(value) {
  if (value === null || value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

export async function GET(request, { params }) {
  const auth = await authenticateApiRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  const role = await getMyRoomRole(supabase, params.id, userId);
  if (!role) return apiError(404, 'not_found', 'Room not found');

  const { searchParams } = new URL(request.url);
  const important = parseBoolParam(searchParams.get('important'));
  const urgent = parseBoolParam(searchParams.get('urgent'));
  const done = parseBoolParam(searchParams.get('done'));
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, MAX_LIMIT);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

  let q = supabase
    .from('tasks')
    .select('id, owner_id, room_id, title, description, important, urgent, done, created_at, due_at, created_by_api_key_id')
    .eq('room_id', params.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (important !== undefined) q = q.eq('important', important);
  if (urgent !== undefined) q = q.eq('urgent', urgent);
  if (done !== undefined) q = q.eq('done', done);

  const { data, error } = await q;
  if (error) return apiError(500, 'db_error', error.message);
  return apiOk({ tasks: (data || []).map(serializeTask) });
}

export async function POST(request, { params }) {
  const auth = await authenticateApiRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId, keyId } = auth;

  const role = await getMyRoomRole(supabase, params.id, userId);
  if (!role) return apiError(404, 'not_found', 'Room not found');
  if (!canWriteWithRole(role)) return apiError(403, 'forbidden', 'Viewers cannot create tasks in this room');

  let body;
  try { body = await request.json(); } catch {
    return apiError(400, 'invalid_json', 'Request body must be valid JSON');
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return apiError(400, 'missing_title', 'title is required');
  if (title.length > 500) return apiError(400, 'title_too_long', 'title must be 500 characters or fewer');

  if (body.due_at && Number.isNaN(new Date(body.due_at).getTime())) {
    return apiError(400, 'invalid_due_at', 'due_at must be a valid ISO 8601 timestamp');
  }

  const payload = {
    owner_id: userId,
    room_id: params.id,
    title,
    description: typeof body.description === 'string' ? body.description : '',
    important: typeof body.important === 'boolean' ? body.important : true,
    urgent: typeof body.urgent === 'boolean' ? body.urgent : true,
    done: false,
    due_at: body.due_at ? new Date(body.due_at).toISOString() : null,
    created_by_api_key_id: keyId
  };

  const { data, error } = await supabase
    .from('tasks')
    .insert(payload)
    .select('id, owner_id, room_id, title, description, important, urgent, done, created_at, due_at, created_by_api_key_id')
    .single();
  if (error) return apiError(500, 'db_error', error.message);
  return apiOk({ task: serializeTask(data) }, 201);
}

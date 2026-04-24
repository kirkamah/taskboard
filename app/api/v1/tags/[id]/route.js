import { authenticateApiRequest, apiError, apiOk } from '@/lib/apiAuth';
import { loadReadableTag, canManageTag, serializeTag } from '@/lib/apiAccess';

export const dynamic = 'force-dynamic';

const TAG_COLORS = ['gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink'];
const MAX_NAME_LENGTH = 24;

export async function GET(request, { params }) {
  const auth = await authenticateApiRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  const { tag } = await loadReadableTag(supabase, params.id, userId);
  if (!tag) return apiError(404, 'not_found', 'Tag not found');
  return apiOk({ tag: serializeTag(tag) });
}

export async function PATCH(request, { params }) {
  const auth = await authenticateApiRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  let body;
  try { body = await request.json(); } catch {
    return apiError(400, 'invalid_json', 'Request body must be valid JSON');
  }

  const { tag, scope, member } = await loadReadableTag(supabase, params.id, userId);
  if (!tag) return apiError(404, 'not_found', 'Tag not found');
  if (!canManageTag(scope, member)) return apiError(403, 'forbidden', 'You do not have permission to edit this tag');

  const patch = {};
  if (typeof body.name === 'string') {
    const n = body.name.trim();
    if (!n) return apiError(400, 'missing_name', 'name cannot be empty');
    if (n.length > MAX_NAME_LENGTH) return apiError(400, 'name_too_long', `name must be ${MAX_NAME_LENGTH} characters or fewer`);
    patch.name = n;
  }
  if (body.color !== undefined) {
    if (!TAG_COLORS.includes(body.color)) {
      return apiError(400, 'invalid_color', `color must be one of: ${TAG_COLORS.join(', ')}`);
    }
    patch.color = body.color;
  }
  if (Object.keys(patch).length === 0) return apiError(400, 'empty_patch', 'No valid fields to update');

  const { data, error } = await supabase
    .from('room_tags')
    .update(patch)
    .eq('id', tag.id)
    .select('id, name, color, room_id, owner_id, created_at')
    .single();

  if (error) {
    if (error.code === '23505') return apiError(409, 'tag_exists', 'A tag with this name already exists in this scope');
    return apiError(500, 'db_error', error.message);
  }
  return apiOk({ tag: serializeTag(data) });
}

export async function DELETE(request, { params }) {
  const auth = await authenticateApiRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  const { tag, scope, member } = await loadReadableTag(supabase, params.id, userId);
  if (!tag) return apiError(404, 'not_found', 'Tag not found');
  if (!canManageTag(scope, member)) return apiError(403, 'forbidden', 'You do not have permission to delete this tag');

  const { error } = await supabase.from('room_tags').delete().eq('id', tag.id);
  if (error) return apiError(500, 'db_error', error.message);
  return apiOk({ deleted: true });
}

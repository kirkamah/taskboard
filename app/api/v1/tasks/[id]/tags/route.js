import { authenticateApiRequest, apiError, apiOk } from '@/lib/apiAuth';
import { loadReadableTaskForWrite, loadReadableTag, canEditTask, serializeTag } from '@/lib/apiAccess';

export const dynamic = 'force-dynamic';

// POST /api/v1/tasks/:id/tags  body: { tag_id }
// Attaches a tag to a task. The tag must live in the same scope as the task
// (personal tag ↔ personal task, or room tag ↔ the same room's task).
export async function POST(request, { params }) {
  const auth = await authenticateApiRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  let body;
  try { body = await request.json(); } catch {
    return apiError(400, 'invalid_json', 'Request body must be valid JSON');
  }

  const tagId = typeof body.tag_id === 'string' ? body.tag_id : '';
  if (!tagId) return apiError(400, 'missing_tag_id', 'tag_id is required');

  const { task, member } = await loadReadableTaskForWrite(supabase, params.id, userId);
  if (!task) return apiError(404, 'not_found', 'Task not found');
  if (!canEditTask(member)) return apiError(403, 'forbidden', 'You do not have permission to edit this task');

  const { tag } = await loadReadableTag(supabase, tagId, userId);
  if (!tag) return apiError(404, 'tag_not_found', 'Tag not found');

  const taskScopeMatches =
    (task.room_id === null && tag.room_id === null && tag.owner_id === userId) ||
    (task.room_id !== null && tag.room_id === task.room_id);
  if (!taskScopeMatches) {
    return apiError(400, 'scope_mismatch', 'Tag and task must belong to the same scope (personal or same room)');
  }

  const { error } = await supabase
    .from('task_tags')
    .insert({ task_id: task.id, tag_id: tag.id });

  // 23505 = primary key violation (already attached). Treat as idempotent.
  if (error && error.code !== '23505') {
    return apiError(500, 'db_error', error.message);
  }

  return apiOk({ attached: true, tag: serializeTag(tag) }, 201);
}

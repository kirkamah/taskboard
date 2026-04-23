import { authenticateApiRequest, apiError, apiOk } from '@/lib/apiAuth';
import { loadReadableTask, loadReadableTaskForWrite, canEditTask, canDeleteTask, serializeTask } from '@/lib/apiAccess';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const auth = await authenticateApiRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  const { task } = await loadReadableTask(supabase, params.id, userId);
  if (!task) return apiError(404, 'not_found', 'Task not found');
  return apiOk({ task: serializeTask(task) });
}

export async function PATCH(request, { params }) {
  const auth = await authenticateApiRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  let body;
  try { body = await request.json(); } catch {
    return apiError(400, 'invalid_json', 'Request body must be valid JSON');
  }

  const { task, member } = await loadReadableTaskForWrite(supabase, params.id, userId);
  if (!task) return apiError(404, 'not_found', 'Task not found');
  if (!canEditTask(member)) return apiError(403, 'forbidden', 'You do not have permission to edit this task');

  const patch = {};
  if (typeof body.title === 'string') {
    const t = body.title.trim();
    if (!t) return apiError(400, 'missing_title', 'title cannot be empty');
    if (t.length > 500) return apiError(400, 'title_too_long', 'title must be 500 characters or fewer');
    patch.title = t;
  }
  if (typeof body.description === 'string') patch.description = body.description;
  if (typeof body.important === 'boolean') patch.important = body.important;
  if (typeof body.urgent === 'boolean') patch.urgent = body.urgent;
  if (typeof body.done === 'boolean') patch.done = body.done;
  if (body.due_at === null) {
    patch.due_at = null;
  } else if (body.due_at !== undefined) {
    if (Number.isNaN(new Date(body.due_at).getTime())) {
      return apiError(400, 'invalid_due_at', 'due_at must be a valid ISO 8601 timestamp or null');
    }
    patch.due_at = new Date(body.due_at).toISOString();
  }

  if (Object.keys(patch).length === 0) return apiError(400, 'empty_patch', 'No valid fields to update');

  const { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', task.id)
    .select('id, owner_id, room_id, title, description, important, urgent, done, created_at, due_at, created_by_api_key_id')
    .single();

  if (error) return apiError(500, 'db_error', error.message);
  return apiOk({ task: serializeTask(data) });
}

export async function DELETE(request, { params }) {
  const auth = await authenticateApiRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  const { task, member } = await loadReadableTaskForWrite(supabase, params.id, userId);
  if (!task) return apiError(404, 'not_found', 'Task not found');
  if (!canDeleteTask(member)) return apiError(403, 'forbidden', 'You do not have permission to delete this task');

  const { error } = await supabase.from('tasks').delete().eq('id', task.id);
  if (error) return apiError(500, 'db_error', error.message);
  return apiOk({ deleted: true });
}

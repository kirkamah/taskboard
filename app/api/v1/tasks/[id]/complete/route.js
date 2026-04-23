import { authenticateApiRequest, apiError, apiOk } from '@/lib/apiAuth';
import { loadReadableTaskForWrite, canEditTask, serializeTask } from '@/lib/apiAccess';

export const dynamic = 'force-dynamic';

// POST /api/v1/tasks/:id/complete — convenience endpoint that sets done=true.
// Callers without edit_any_task (e.g. 'Зритель' role) cannot mark tasks
// complete via the API (403). If they want to "ask" for completion, that is
// a separate flow (task_completion_requests) that v1 does not expose.
export async function POST(request, { params }) {
  const auth = await authenticateApiRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  const { task, member } = await loadReadableTaskForWrite(supabase, params.id, userId);
  if (!task) return apiError(404, 'not_found', 'Task not found');
  if (!canEditTask(member)) return apiError(403, 'forbidden', 'You do not have permission to mark this task complete');

  if (task.done) {
    return apiOk({ task: { ...task, done: true } });
  }

  const { data, error } = await supabase
    .from('tasks')
    .update({ done: true })
    .eq('id', task.id)
    .select('id, owner_id, room_id, title, description, important, urgent, done, created_at, due_at, created_by_api_key_id')
    .single();

  if (error) return apiError(500, 'db_error', error.message);
  return apiOk({ task: serializeTask(data) });
}

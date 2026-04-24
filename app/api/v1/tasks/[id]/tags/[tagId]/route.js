import { authenticateApiRequest, apiError, apiOk } from '@/lib/apiAuth';
import { loadReadableTaskForWrite, canEditTask } from '@/lib/apiAccess';

export const dynamic = 'force-dynamic';

// DELETE /api/v1/tasks/:id/tags/:tagId — detaches a tag from a task.
// Idempotent: succeeds with detached=false if the tag was not attached.
export async function DELETE(request, { params }) {
  const auth = await authenticateApiRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  const { task, member } = await loadReadableTaskForWrite(supabase, params.id, userId);
  if (!task) return apiError(404, 'not_found', 'Task not found');
  if (!canEditTask(member)) return apiError(403, 'forbidden', 'You do not have permission to edit this task');

  const { data, error } = await supabase
    .from('task_tags')
    .delete()
    .eq('task_id', task.id)
    .eq('tag_id', params.tagId)
    .select('task_id');

  if (error) return apiError(500, 'db_error', error.message);
  return apiOk({ detached: (data || []).length > 0 });
}

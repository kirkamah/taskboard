import { authenticateApiRequest, apiError, apiOk } from '@/lib/apiAuth';
import { loadReadableTaskForWrite, canEditTask, serializeTask, loadTagsForTasks } from '@/lib/apiAccess';

export const dynamic = 'force-dynamic';

// Eisenhower matrix shortcut. Four named quadrants → (important, urgent).
const QUADRANTS = {
  do: { important: true, urgent: true },
  plan: { important: true, urgent: false },
  delegate: { important: false, urgent: true },
  drop: { important: false, urgent: false }
};

export async function POST(request, { params }) {
  const auth = await authenticateApiRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  let body;
  try { body = await request.json(); } catch {
    return apiError(400, 'invalid_json', 'Request body must be valid JSON');
  }

  const quadrant = typeof body.quadrant === 'string' ? body.quadrant.toLowerCase() : '';
  const patch = QUADRANTS[quadrant];
  if (!patch) {
    return apiError(400, 'invalid_quadrant', 'quadrant must be one of: do, plan, delegate, drop');
  }

  const { task, member } = await loadReadableTaskForWrite(supabase, params.id, userId);
  if (!task) return apiError(404, 'not_found', 'Task not found');
  if (!canEditTask(member)) return apiError(403, 'forbidden', 'You do not have permission to move this task');

  const { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', task.id)
    .select('id, owner_id, room_id, title, description, important, urgent, done, created_at, due_at, created_by_api_key_id')
    .single();

  if (error) return apiError(500, 'db_error', error.message);

  const tagMap = await loadTagsForTasks(supabase, [data.id]);
  return apiOk({ task: serializeTask(data, tagMap.get(data.id)) });
}

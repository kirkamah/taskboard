import { authenticateApiRequest, apiError, apiOk } from '@/lib/apiAuth';
import { getMyRoomRole } from '@/lib/apiAccess';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const auth = await authenticateApiRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  const role = await getMyRoomRole(supabase, params.id, userId);
  if (!role) return apiError(404, 'not_found', 'Room not found');

  const { data, error } = await supabase
    .from('room_members')
    .select('role, joined_at, user_id, profiles(display_name, avatar_emoji, avatar_color)')
    .eq('room_id', params.id);
  if (error) return apiError(500, 'db_error', error.message);

  const members = (data || []).map(m => ({
    user_id: m.user_id,
    role: m.role,
    joined_at: m.joined_at,
    display_name: m.profiles?.display_name || null,
    avatar_emoji: m.profiles?.avatar_emoji || null,
    avatar_color: m.profiles?.avatar_color || 'gray'
  }));

  return apiOk({ members });
}

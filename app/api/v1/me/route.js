import { authenticateApiRequest, apiError, apiOk } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await authenticateApiRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_emoji, avatar_color')
    .eq('id', userId)
    .maybeSingle();

  const { data: userRes } = await supabase.auth.admin.getUserById(userId);
  if (!userRes?.user) return apiError(404, 'user_not_found', 'User not found');

  return apiOk({
    id: userId,
    email: userRes.user.email,
    display_name: profile?.display_name || userRes.user.email?.split('@')[0] || 'Пользователь'
  });
}

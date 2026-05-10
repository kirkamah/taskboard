import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// OAuth callback. Supabase returns the user to this URL with `?code=...` after
// the provider sign-in. We exchange the code for a session cookie and bounce
// to the requested page (dashboard by default).
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}

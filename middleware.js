import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Exclude /api/v1/* — those routes authenticate via Bearer API key, not cookies,
    // and the default updateSession would redirect them to /login.
    '/((?!_next/static|_next/image|favicon.ico|api/v1|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  ]
};

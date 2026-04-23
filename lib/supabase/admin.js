import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Service-role client for use inside /api/v1/* routes where the caller is
// identified by an API key (not a Supabase JWT cookie). The anon/cookie client
// is wrong here: there is no user session, and cookies must not be read in
// public API routes. RLS is permissive project-wide (using true), so this
// client talks to the DB directly and we gate authorization in application code.
//
// SUPABASE_SERVICE_ROLE_KEY MUST be set in the environment (Vercel → Settings
// → Environment Variables). Never expose this key to the browser.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Supabase admin client misconfigured: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set'
    );
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

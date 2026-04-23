import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractBearer, hashApiKey, isValidKeyShape } from '@/lib/apiKeys';
import { checkRateLimit } from '@/lib/rateLimit';

// Standard error envelope for the public API. Kept minimal and stable so that
// client implementations (MCP server, Custom GPT, cURL users) can rely on the shape.
export function apiError(status, code, message, extraHeaders = {}) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: extraHeaders }
  );
}

export function apiOk(body, status = 200) {
  return NextResponse.json(body, { status });
}

// Authenticates the request by API key and enforces per-key rate limit.
// On success returns { supabase, userId, keyId } for the handler to use.
// On failure returns a NextResponse the handler should return immediately.
export async function authenticateApiRequest(request) {
  const token = extractBearer(request);
  if (!token) {
    return { error: apiError(401, 'missing_token', 'Authorization header with Bearer token is required') };
  }
  if (!isValidKeyShape(token)) {
    return { error: apiError(401, 'invalid_token', 'Malformed API key') };
  }

  const hash = hashApiKey(token);
  const supabase = createAdminClient();
  const { data: key, error } = await supabase
    .from('api_keys')
    .select('id, user_id, revoked_at')
    .eq('key_hash', hash)
    .maybeSingle();

  if (error) {
    return { error: apiError(500, 'auth_lookup_failed', 'Failed to verify API key') };
  }
  if (!key) {
    return { error: apiError(401, 'invalid_token', 'API key not found') };
  }
  if (key.revoked_at) {
    return { error: apiError(401, 'revoked', 'This API key has been revoked') };
  }

  const rl = checkRateLimit(key.id);
  if (!rl.ok) {
    return { error: apiError(429, 'rate_limited', 'Too many requests, retry later', { 'Retry-After': String(rl.retryAfter) }) };
  }

  // Fire-and-forget last_used_at update. Don't await — we don't want it on the
  // hot path, and if the write fails we just miss one timestamp update.
  supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id).then(() => {});

  return { supabase, userId: key.user_id, keyId: key.id };
}

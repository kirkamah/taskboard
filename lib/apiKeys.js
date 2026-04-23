import crypto from 'node:crypto';

// Format: tb_live_<32 URL-safe chars>. Chosen to mirror the Stripe convention
// so users recognize it as a long-lived secret.
const KEY_PREFIX = 'tb_live_';
const SECRET_LEN = 32;

// The prefix stored in the DB is what we show in the UI as an identifier —
// long enough to distinguish keys (last 6 visible), short enough to not leak
// useful entropy if the row is exposed. Tuned so users see "tb_live_abcdef****"
// where abcdef is the first 6 chars of the secret portion.
export const STORED_PREFIX_LEN = KEY_PREFIX.length + 6; // "tb_live_" + 6 chars

export function generateApiKey() {
  // 32 chars of URL-safe base64, no padding. 24 random bytes → 32 base64url chars.
  const secret = crypto.randomBytes(24).toString('base64url').slice(0, SECRET_LEN);
  const full = KEY_PREFIX + secret;
  return {
    full,
    prefix: full.slice(0, STORED_PREFIX_LEN),
    hash: hashApiKey(full)
  };
}

export function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function isValidKeyShape(key) {
  if (typeof key !== 'string') return false;
  if (!key.startsWith(KEY_PREFIX)) return false;
  if (key.length !== KEY_PREFIX.length + SECRET_LEN) return false;
  return /^tb_live_[A-Za-z0-9_-]+$/.test(key);
}

export function extractBearer(request) {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

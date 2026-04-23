// Simple in-memory fixed-window rate limiter: 60 requests per 60s per API key.
//
// Caveat: in-memory state is per-server-instance. On Vercel, each serverless
// function instance has its own Map, so a burst split across cold starts can
// exceed the intended limit. For v1 this is acceptable — abuse prevention, not
// strict quota enforcement. Upgrade path: Upstash Redis (env flag to switch).

const WINDOW_MS = 60_000;
const MAX_REQ = 60;

// key -> { count, resetAt }
const buckets = new Map();

export function checkRateLimit(key) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: MAX_REQ - 1, retryAfter: 0 };
  }
  if (b.count >= MAX_REQ) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { ok: true, remaining: MAX_REQ - b.count, retryAfter: 0 };
}

// Best-effort GC — runs on reads, so dead buckets don't grow forever.
// Called opportunistically from checkRateLimit's cold path not necessary here,
// but let's expose a manual sweep just in case.
export function sweepExpired(now = Date.now()) {
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

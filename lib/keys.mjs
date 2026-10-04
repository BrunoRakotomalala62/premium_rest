// API-key pool with health tracking and automatic rotation — Edge/ESM, zero deps.
//
// Why: a CodeCraft plan gives ~1,000,000 tokens/month. Once a key is exhausted
// upstream answers 429/402/403. With several keys in the Vercel env we rotate to
// the next healthy key instead of failing the request.
//
// Keys are read from the environment, in this order (duplicates removed):
//   1. CODECRAFT_API_KEY / CODECRAFT_KEY              — the primary key
//   2. CODECRAFT_API_KEYS                             — a list, split on , ; whitespace and newlines
//   3. CODECRAFT_API_KEY_1..N / CODECRAFT_KEY_1..N    — numbered slots (N <= CODECRAFT_KEYS_MAX)
//
// State (cursor + per-key cooldowns) lives in module scope: it is shared across
// warm invocations of the same Edge isolate. Cold starts simply reset it, which
// is safe because cooldowns only optimise; they never block a request.

function intEnv(name, fallback) {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const MAX_NUMBERED_KEYS = intEnv('CODECRAFT_KEYS_MAX', 50);

// How long a key is put aside after a given kind of failure.
const COOLDOWN_QUOTA_MS = intEnv('KEY_COOLDOWN_QUOTA_MS', 60 * 60 * 1000); // quota exhausted
const COOLDOWN_INVALID_MS = intEnv('KEY_COOLDOWN_INVALID_MS', 30 * 60 * 1000); // bad/revoked key
const COOLDOWN_RATE_MS = intEnv('KEY_COOLDOWN_RATE_MS', 60 * 1000); // transient rate limit
const COOLDOWN_FORBIDDEN_MS = intEnv('KEY_COOLDOWN_FORBIDDEN_MS', 15 * 60 * 1000); // 403, unclear

// failover (default): stay on the last good key until it breaks.
// round-robin: spread requests across every key to balance monthly quota usage.
const STRATEGY = (process.env.KEY_STRATEGY || 'failover').toLowerCase() === 'round-robin'
  ? 'round-robin'
  : 'failover';

const QUOTA_HINTS = /quota|credit|balance|billing|payment|insufficient|exhaust|out of (?:credit|quota|funds)|monthly|expired|额度|配额|余额|欠费|超出/i;
const RATE_HINTS = /rate limit|too many requests|requests per|rpm|tpm|slow down|限流|频率/i;

function splitKeys(value) {
  return String(value || '')
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseKeys() {
  const seen = new Set();
  const keys = [];
  const push = (k) => {
    const key = String(k || '').trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  };

  push(process.env.CODECRAFT_API_KEY);
  push(process.env.CODECRAFT_KEY);
  for (const k of splitKeys(process.env.CODECRAFT_API_KEYS)) push(k);
  for (let i = 1; i <= MAX_NUMBERED_KEYS; i++) {
    push(process.env[`CODECRAFT_API_KEY_${i}`]);
    push(process.env[`CODECRAFT_KEY_${i}`]);
  }
  return keys;
}

const KEYS = parseKeys();

// key -> { until: epochMs, reason, type }
const health = new Map();
let cursor = 0;

function rotate(arr, start) {
  if (!arr.length || start <= 0) return arr.slice();
  const i = ((start % arr.length) + arr.length) % arr.length;
  return arr.slice(i).concat(arr.slice(0, i));
}

function mask(key) {
  if (key.length <= 8) return '…';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export function hasKeys() {
  return KEYS.length > 0;
}

export function keyCount() {
  return KEYS.length;
}

export function strategy() {
  return STRATEGY;
}

/**
 * Keys to try, best first. Healthy keys come first (starting at the sticky
 * cursor); keys in cooldown are appended worst-last so that when *every* key is
 * cooling the request still fails open and is attempted anyway.
 * Entries: { key, index, cooling, cooldownMs, reason }
 */
export function nextOrder() {
  const now = Date.now();
  const items = KEYS.map((key, index) => {
    const h = health.get(key);
    const cooling = !!(h && h.until > now);
    return {
      key,
      index,
      cooling,
      cooldownMs: cooling ? h.until - now : 0,
      reason: cooling ? h.reason : null,
    };
  });
  const ready = items.filter((x) => !x.cooling);
  const cooling = items.filter((x) => x.cooling).sort((a, b) => a.cooldownMs - b.cooldownMs);
  return rotate(ready, cursor).concat(cooling);
}

export function markGood(key) {
  health.delete(key);
  const idx = KEYS.indexOf(key);
  if (idx === -1) return;
  cursor = STRATEGY === 'round-robin' ? (idx + 1) % KEYS.length : idx;
}

export function markBad(key, info) {
  if (!KEYS.includes(key)) return;
  const cooldownMs = info && info.cooldownMs > 0 ? info.cooldownMs : COOLDOWN_RATE_MS;
  health.set(key, {
    until: Date.now() + cooldownMs,
    reason: (info && info.reason) || 'upstream error',
    type: (info && info.type) || 'error',
  });
}

/**
 * Decide whether a failure is key-related (so we should try another key) and
 * how long to bench the offending key.
 * @returns {{rotatable:boolean, type?:string, cooldownMs?:number, reason?:string}}
 */
export function classifyFailure(err) {
  const status = (err && (err.upstreamStatus || err.status)) || 0;
  const message = String((err && err.message) || '');
  const quota = QUOTA_HINTS.test(message);
  const rate = RATE_HINTS.test(message);

  if (status === 401) {
    return { rotatable: true, type: 'invalid_key', cooldownMs: COOLDOWN_INVALID_MS, reason: 'invalid key (401)' };
  }
  if (status === 402) {
    return { rotatable: true, type: 'quota', cooldownMs: COOLDOWN_QUOTA_MS, reason: 'quota/payment required (402)' };
  }
  if (status === 429) {
    if (quota && !rate) {
      return { rotatable: true, type: 'quota', cooldownMs: COOLDOWN_QUOTA_MS, reason: 'quota exhausted (429)' };
    }
    const retryAfter = err && err.retryAfterSeconds;
    return {
      rotatable: true,
      type: quota ? 'quota' : 'rate_limit',
      cooldownMs: quota ? COOLDOWN_QUOTA_MS : retryAfter ? retryAfter * 1000 : COOLDOWN_RATE_MS,
      reason: quota ? 'quota exhausted (429)' : 'rate limited (429)',
    };
  }
  if (status === 403) {
    if (quota) {
      return { rotatable: true, type: 'quota', cooldownMs: COOLDOWN_QUOTA_MS, reason: 'quota forbidden (403)' };
    }
    return { rotatable: true, type: 'forbidden', cooldownMs: COOLDOWN_FORBIDDEN_MS, reason: 'forbidden (403)' };
  }
  return { rotatable: false };
}

/** Diagnostic view — never exposes full keys. */
export function snapshot() {
  const now = Date.now();
  return KEYS.map((key, index) => {
    const h = health.get(key);
    const cooling = !!(h && h.until > now);
    return {
      index,
      label: mask(key),
      status: cooling ? 'cooling' : 'ready',
      cooldown_ms: cooling ? h.until - now : 0,
      reason: cooling ? h.reason : null,
    };
  });
}

/** Test helper: forget every cooldown and reset the cursor. */
export function resetHealth() {
  health.clear();
  cursor = 0;
}

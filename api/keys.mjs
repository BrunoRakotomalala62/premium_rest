export const config = { runtime: 'edge' };

// GET /api/keys — rotation diagnostic.
// Reports how many CodeCraft keys are configured and their current health,
// without ever exposing a full key (labels are masked).

import { preflight, readParams, json, errorResponse, requireAuth } from '../lib/http.mjs';
import { keyCount, strategy, snapshot } from '../lib/keys.mjs';

export default async function handler(req) {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'GET') return errorResponse(405, 'Method not allowed. Use GET.', 'method_not_allowed');

  const params = await readParams(req);
  const auth = requireAuth(req, params);
  if (auth) return auth;

  const pool = snapshot();
  return json({
    ok: true,
    rotation: { enabled: keyCount() > 1, strategy: strategy(), keys: keyCount() },
    ready: pool.filter((k) => k.status === 'ready').length,
    cooling: pool.filter((k) => k.status === 'cooling').length,
    pool,
  });
}

export const config = { runtime: 'edge' };

// GET /api/vision?prompt=décrivez bien cette photo&image=URL&model=...&uid=123
// `image` accepts a public URL, a data: image URI, or a comma/newline list.

import { preflight, query, json, errorResponse, requireAuth } from '../lib/http.mjs';
import { runVision } from '../lib/ai.mjs';

export default async function handler(req) {
  const pf = preflight(req);
  if (pf) return pf;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return errorResponse(405, 'Method not allowed. Use GET.', 'method_not_allowed');
  }

  const params = query(req);
  const auth = requireAuth(req, params);
  if (auth) return auth;

  try {
    const { status, body } = await runVision(params);
    return json(body, status);
  } catch (e) {
    return errorResponse(e.status || 500, e.message || 'Internal error', e.code || 'internal_error', e.details);
  }
}

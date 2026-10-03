export const config = { runtime: 'edge' };

// GET /api/ai?prompt=bonjour&uid=123[&model=claude-opus-5]
// Continuous text conversation, remembered per uid.
// If an `image` param is present it transparently routes to vision.

import { preflight, query, json, errorResponse, requireAuth } from '../lib/http.mjs';
import { runChat, runVision } from '../lib/ai.mjs';

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
    const hasImage = params.image || params.images;
    const { status, body } = hasImage ? await runVision(params) : await runChat(params);
    return json(body, status);
  } catch (e) {
    return errorResponse(e.status || 500, e.message || 'Internal error', e.code || 'internal_error', e.details);
  }
}

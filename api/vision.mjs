export const config = { runtime: 'edge' };

// GET /api/vision?prompt=décrivez bien cette photo&image=URL&model=...&uid=123
// `image` accepts a public URL, a data: image URI, or a comma/newline list.

import { preflight, readParams, json, errorResponse, requireAuth, raceJsonOrStream } from '../lib/http.mjs';
import { runVision } from '../lib/ai.mjs';

export default async function handler(req) {
  const pf = preflight(req);
  if (pf) return pf;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return errorResponse(405, 'Method not allowed. Use GET.', 'method_not_allowed');
  }

  const params = await readParams(req);
  const auth = requireAuth(req, params);
  if (auth) return auth;

  // Long image generations (>25s) are streamed so Edge Functions don't 504 without CORS.
  return raceJsonOrStream(runVision(params));
}

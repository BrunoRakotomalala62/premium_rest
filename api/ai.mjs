export const config = { runtime: 'edge' };

// GET /api/ai?prompt=bonjour&uid=123[&model=claude-opus-5]
// Continuous text conversation, remembered per uid.
// If an `image` param is present it transparently routes to vision.

import { preflight, readParams, json, errorResponse, requireAuth, raceJsonOrStream } from '../lib/http.mjs';
import { runChat, runVision } from '../lib/ai.mjs';

export default async function handler(req) {
  const pf = preflight(req);
  if (pf) return pf;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return errorResponse(405, 'Method not allowed. Use GET.', 'method_not_allowed');
  }

  const params = await readParams(req);
  const auth = requireAuth(req, params);
  if (auth) return auth;

  // Long generations (>25s) are streamed so Edge Functions don't 504 without CORS.
  const hasImage = params.image || params.images;
  return raceJsonOrStream(hasImage ? runVision(params) : runChat(params));
}

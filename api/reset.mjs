export const config = { runtime: 'edge' };

// GET /api/reset?uid=123 — forget the stored conversation for a uid.

import { preflight, readParams, json, errorResponse, requireAuth } from '../lib/http.mjs';
import * as store from '../lib/store.mjs';

export default async function handler(req) {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'GET' && req.method !== 'POST') {
    return errorResponse(405, 'Method not allowed. Use GET.', 'method_not_allowed');
  }

  const params = await readParams(req);
  const auth = requireAuth(req, params);
  if (auth) return auth;

  const uid = params.uid;
  if (!uid) return errorResponse(400, 'Missing required query param "uid".', 'missing_uid', { param: 'uid' });

  try {
    await store.clear(String(uid).trim());
    return json({ ok: true, uid: String(uid).trim(), message: 'Conversation cleared.' });
  } catch (e) {
    return errorResponse(500, e.message || 'Reset failed', 'reset_failed');
  }
}

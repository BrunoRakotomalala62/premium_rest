'use strict';

/**
 * GET /api/reset?uid=123 — forget the stored conversation for a uid.
 */

const { handlePreflight, getQuery, sendJson, sendError, requireAuth } = require('../lib/http');
const store = require('../lib/store');

module.exports = async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed. Use GET.', 'method_not_allowed');
  }

  const { uid } = getQuery(req);
  if (requireAuth(req, res, getQuery(req))) return;
  if (!uid) return sendError(res, 400, 'Missing required query param "uid".', 'missing_uid', { param: 'uid' });

  try {
    await store.clear(String(uid).trim());
    return sendJson(res, 200, { ok: true, uid: String(uid).trim(), message: 'Conversation cleared.' });
  } catch (e) {
    return sendError(res, 500, e.message || 'Reset failed', 'reset_failed');
  }
};

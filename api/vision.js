'use strict';

/**
 * GET /api/vision?prompt=décrivez bien cette photo&image=URL&model=...&uid=123
 * Image understanding. `image` accepts a public URL, a data: image URI, or a
 * comma/newline-separated list of URLs.
 */

const { handlePreflight, getQuery, sendJson, sendError, requireAuth } = require('../lib/http');
const { runVision } = require('../lib/ai');

module.exports = async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed. Use GET.', 'method_not_allowed');
  }

  const params = getQuery(req);
  if (requireAuth(req, res, params)) return;

  try {
    const { status, body } = await runVision(params);
    return sendJson(res, status, body);
  } catch (e) {
    return sendError(res, e.status || 500, e.message || 'Internal error', e.code || 'internal_error');
  }
};

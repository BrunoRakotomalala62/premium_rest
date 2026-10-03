'use strict';

/**
 * GET /api/ai?prompt=bonjour&uid=123[&model=claude-opus-5]
 * Continuous text conversation, remembered per uid.
 *
 * If an `image` param is present, it transparently routes to vision so that
 * GET /api/ai?...&image=... also works.
 */

const { handlePreflight, getQuery, sendJson, sendError, requireAuth } = require('../lib/http');
const { runChat, runVision } = require('../lib/ai');

module.exports = async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed. Use GET.', 'method_not_allowed');
  }

  const params = getQuery(req);
  if (requireAuth(req, res, params)) return;

  try {
    const hasImage = params.image || params.images;
    const { status, body } = hasImage ? await runVision(params) : await runChat(params);
    return sendJson(res, status, body);
  } catch (e) {
    return sendError(res, e.status || 500, e.message || 'Internal error', e.code || 'internal_error');
  }
};

'use strict';

/**
 * GET /api/models — list the models exposed by CodeCraft, with vision flags
 * and the friendly aliases accepted by /api/ai and /api/vision.
 */

const { handlePreflight, sendJson, sendError } = require('../lib/http');
const { listModels } = require('../lib/ai');
const { MODEL_ALIASES, DEFAULT_MODEL, VISION_DEFAULT_MODEL } = require('../lib/models');

module.exports = async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  if (req.method !== 'GET') return sendError(res, 405, 'Method not allowed. Use GET.', 'method_not_allowed');

  const models = listModels();
  sendJson(res, 200, {
    ok: true,
    object: 'list',
    count: models.length,
    defaults: { text: DEFAULT_MODEL, vision: VISION_DEFAULT_MODEL },
    aliases: MODEL_ALIASES,
    data: models,
  });
};

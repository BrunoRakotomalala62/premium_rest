export const config = { runtime: 'edge' };

// GET /api/models — catalog with vision flags and accepted aliases.

import { preflight, json, errorResponse } from '../lib/http.mjs';
import { listModels } from '../lib/ai.mjs';
import { MODEL_ALIASES, DEFAULT_MODEL, VISION_DEFAULT_MODEL } from '../lib/models.mjs';

export default async function handler(req) {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'GET') return errorResponse(405, 'Method not allowed. Use GET.', 'method_not_allowed');

  const models = listModels();
  return json({
    ok: true,
    object: 'list',
    count: models.length,
    defaults: { text: DEFAULT_MODEL, vision: VISION_DEFAULT_MODEL },
    capabilities: {
      vision: models.filter((m) => m.vision).length,
      tools: models.filter((m) => m.tools).length,
      web_search: models.filter((m) => m.web_search).length,
    },
    web_search: {
      enable: 'add &web=1 to /api/ai',
      note: 'Real web search via tool calling (works with any tools-capable model), not CodeCraft-side search.',
    },
    aliases: MODEL_ALIASES,
    data: models,
  });
}

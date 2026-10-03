'use strict';

/**
 * GET / — API index / self-documentation.
 */

const { handlePreflight, sendJson } = require('../lib/http');
const { DEFAULT_MODEL, VISION_DEFAULT_MODEL, MODEL_CATALOG } = require('../lib/models');

module.exports = async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  const base = '/api';
  sendJson(res, 200, {
    ok: true,
    name: 'premium_rest',
    description: 'REST wrapper around the CodeCraft API (OpenAI-compatible) with continuous per-uid conversations and vision.',
    backend: 'https://codecraftapi.com/v1',
    endpoints: {
      chat: `GET ${base}/ai?prompt=bonjour&uid=123&model=${DEFAULT_MODEL}`,
      chatWithImage: `GET ${base}/ai?prompt=décrivez cette photo&image=https://...jpg&uid=123`,
      vision: `GET ${base}/vision?prompt=décrivez cette photo&image=https://...jpg&model=${VISION_DEFAULT_MODEL}&uid=123`,
      models: `GET ${base}/models`,
      reset: `GET ${base}/reset?uid=123`,
    },
    params: {
      prompt: 'required — the user message',
      uid: 'conversation id; the full history is kept server-side per uid',
      image: 'vision only — public URL or data:image/... URI (comma-separated for several)',
      model: 'optional — model id or alias (claude-5, mythos, luna, terra, sol, ...)',
      system: 'optional — system prompt (chat)',
      reset: 'optional — 1 to start a fresh conversation for this uid',
      nostore: 'optional — 1 to bypass conversation memory',
      max_tokens: 'optional — max generated tokens',
      temperature: 'optional — 0.0–2.0',
    },
    models_count: MODEL_CATALOG.length,
    aliases: ['claude-5', 'mythos', 'luna', 'terra', 'sol', 'gpt-5.6', 'gemini', 'grok', 'deepseek', 'qwen', 'kimi'],
  });
};

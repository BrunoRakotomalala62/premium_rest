export const config = { runtime: 'edge' };

// GET / — API index / self-documentation.

import { preflight, json } from '../lib/http.mjs';
import { DEFAULT_MODEL, VISION_DEFAULT_MODEL, MODEL_CATALOG } from '../lib/models.mjs';
import { searchProvider, searchConfigured } from '../lib/search.mjs';

export default async function handler(req) {
  const pf = preflight(req);
  if (pf) return pf;

  const base = '/api';
  return json({
    ok: true,
    name: 'premium_rest',
    runtime: 'vercel-edge',
    description: 'REST wrapper around the CodeCraft API with continuous per-uid conversations and vision.',
    backend: 'https://codecraftapi.com/v1',
    endpoints: {
      chat: `GET ${base}/ai?prompt=bonjour&uid=123&model=${DEFAULT_MODEL}`,
      chatWithWeb: `GET ${base}/ai?prompt=actualit%C3%A9s%20du%20jour&web=1&uid=123`,
      chatWithImage: `GET ${base}/ai?prompt=décrivez cette photo&image=https://...jpg&uid=123`,
      vision: `GET ${base}/vision?prompt=décrivez cette photo&image=https://...jpg&model=${VISION_DEFAULT_MODEL}&uid=123`,
      models: `GET ${base}/models`,
      reset: `GET ${base}/reset?uid=123`,
      keys: `GET ${base}/keys`,
    },
    params: {
      prompt: 'required — the user message',
      uid: 'conversation id; history is kept server-side per uid',
      image: 'vision only — public URL or data:image/... URI (comma-separated for several)',
      model: 'optional — model id or alias (claude-5, mythos, luna, terra, sol, ...)',
      system: 'optional — system prompt (chat)',
      reset: 'optional — 1 to start a fresh conversation for this uid',
      nostore: 'optional — 1 to bypass conversation memory',
      return_history: 'optional — 1 to include the stored messages in the response',
      max_tokens: 'optional — max generated tokens',
      temperature: 'optional — 0.0–2.0',
      web: 'optional — 1 to enable real web search (tool calling) and return sources',
      max_results: 'optional — number of web results per search (default 5)',
      web_rounds: 'optional — max search rounds (default 3)',
    },
    rotation: 'automatic multi-key failover — add CODECRAFT_API_KEYS (or CODECRAFT_API_KEY_1, _2, …) to rotate on quota/rate-limit',
    web_search: {
      enable: 'add &web=1 to /api/ai (requires a search provider)',
      provider: searchProvider(),
      configured: searchConfigured(),
      configure: 'TAVILY_API_KEY (recommended) / BRAVE_API_KEY / SERPAPI_API_KEY / SEARXNG_URL; keyless DuckDuckGo only via SEARCH_PROVIDER=duckduckgo (best-effort)',
    },
    models_count: MODEL_CATALOG.length,
    aliases: ['claude-5', 'mythos', 'luna', 'terra', 'sol', 'gpt-5.6', 'gemini', 'grok', 'deepseek', 'qwen', 'kimi'],
  });
}

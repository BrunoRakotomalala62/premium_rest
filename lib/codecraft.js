'use strict';

/**
 * Thin client for the CodeCraft API (OpenAI-compatible).
 * Base URL: https://codecraftapi.com/v1
 * Auth:     Authorization: Bearer cc_...
 *
 * Only the two capabilities this project needs are wrapped:
 *   - chat({ model, messages })            -> POST /chat/completions
 *   - vision({ model, prompt, imageUrls }) -> POST /chat/completions (multimodal)
 */

const BASE_URL = (process.env.CODECRAFT_BASE_URL || 'https://codecraftapi.com/v1').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = parseInt(process.env.UPSTREAM_TIMEOUT_MS || '55000', 10);

function apiKey() {
  const key = process.env.CODECRAFT_API_KEY || process.env.CODECRAFT_KEY || '';
  if (!key) {
    const err = new Error(
      'CODECRAFT_API_KEY is not set. Add it to your Vercel project env (Settings → Environment Variables).'
    );
    err.status = 500;
    err.code = 'missing_api_key';
    throw err;
  }
  return key;
}

async function callUpstream(body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      const err = new Error('Upstream request timed out.');
      err.status = 504;
      err.code = 'upstream_timeout';
      throw err;
    }
    const err = new Error(`Upstream fetch failed: ${e.message}`);
    err.status = 502;
    err.code = 'upstream_unreachable';
    throw err;
  }
  clearTimeout(timer);

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }

  if (!res.ok) {
    const message =
      (json && json.error && (json.error.message || json.error.code)) || text.slice(0, 300) || `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status === 401 || res.status === 403 || res.status === 402 ? res.status : 502;
    err.code = (json && json.error && json.error.code) || 'upstream_error';
    err.upstreamStatus = res.status;
    throw err;
  }
  return json;
}

function extract(result) {
  const choice = result && result.choices && result.choices[0];
  const message = (choice && choice.message) || {};
  let content = message.content;
  if (Array.isArray(content)) {
    content = content.map((p) => (typeof p === 'string' ? p : p && p.text ? p.text : '')).join('');
  }
  return {
    reply: content == null ? '' : String(content),
    finishReason: choice ? choice.finish_reason : null,
    model: result && result.model,
    usage: result && result.usage ? result.usage : null,
    id: result && result.id,
  };
}

/** Plain text chat. `messages` is a full OpenAI-style message array. */
async function chat({ model, messages, maxTokens, temperature, topP }) {
  const body = { model, messages };
  if (maxTokens) body.max_tokens = maxTokens;
  if (temperature != null) body.temperature = temperature;
  if (topP != null) body.top_p = topP;
  const result = await callUpstream(body);
  return extract(result);
}

/** Multimodal chat: one text prompt + one or more image URLs. */
async function vision({ model, prompt, imageUrls, maxTokens }) {
  const parts = [{ type: 'text', text: prompt }];
  for (const url of imageUrls) {
    parts.push({ type: 'image_url', image_url: { url } });
  }
  const body = { model, messages: [{ role: 'user', content: parts }] };
  if (maxTokens) body.max_tokens = maxTokens;
  const result = await callUpstream(body);
  return extract(result);
}

module.exports = { chat, vision, BASE_URL };

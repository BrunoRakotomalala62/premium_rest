// Thin client for the CodeCraft API (OpenAI-compatible) — Edge compatible.
// Base URL: https://codecraftapi.com/v1

const BASE_URL = (process.env.CODECRAFT_BASE_URL || 'https://codecraftapi.com/v1').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = parseInt(process.env.UPSTREAM_TIMEOUT_MS || '55000', 10);

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const USER_AGENT = process.env.CODECRAFT_USER_AGENT || DEFAULT_USER_AGENT;

function browserHeaders() {
  return {
    'User-Agent': USER_AGENT,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    Referer: 'https://codecraftapi.com/',
    Origin: 'https://codecraftapi.com',
  };
}

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
      headers: { ...browserHeaders(), Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === 'AbortError') {
      const err = new Error('Upstream request timed out.');
      err.status = 504;
      err.code = 'upstream_timeout';
      throw err;
    }
    const err = new Error(`Upstream fetch failed: ${e && e.message}`);
    err.status = 502;
    err.code = 'upstream_unreachable';
    throw err;
  }
  clearTimeout(timer);

  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }

  if (!parsed && /<(!doctype|html|head|title)/i.test(text.slice(0, 400))) {
    const diag = {
      upstream_status: res.status,
      server: res.headers.get('server') || null,
      cf_mitigated: res.headers.get('cf-mitigated') || null,
      cf_ray: res.headers.get('cf-ray') || null,
    };
    const err = new Error(
      'CodeCraft upstream returned an HTML challenge (Cloudflare) instead of JSON. ' + `diagnostics=${JSON.stringify(diag)}`
    );
    err.status = 502;
    err.code = 'upstream_challenge';
    err.details = diag;
    throw err;
  }

  if (!res.ok) {
    const message =
      (parsed && parsed.error && (parsed.error.message || parsed.error.code)) ||
      text.slice(0, 300) ||
      `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status === 401 || res.status === 403 || res.status === 402 ? res.status : 502;
    err.code = (parsed && parsed.error && parsed.error.code) || 'upstream_error';
    err.upstreamStatus = res.status;
    throw err;
  }
  return parsed;
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

export async function chat({ model, messages, maxTokens, temperature, topP }) {
  const body = { model, messages };
  if (maxTokens) body.max_tokens = maxTokens;
  if (temperature != null) body.temperature = temperature;
  if (topP != null) body.top_p = topP;
  return extract(await callUpstream(body));
}

export async function vision({ model, prompt, imageUrls, maxTokens }) {
  const parts = [{ type: 'text', text: prompt }];
  for (const url of imageUrls) parts.push({ type: 'image_url', image_url: { url } });
  const body = { model, messages: [{ role: 'user', content: parts }] };
  if (maxTokens) body.max_tokens = maxTokens;
  return extract(await callUpstream(body));
}

export { BASE_URL };

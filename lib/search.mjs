// Web search providers — Edge/ESM, zero deps.
//
// Used by lib/websearch.mjs to power `?web=1` on /api/ai.
//
// Configure ONE of these in the Vercel env (Settings → Environment Variables):
//   TAVILY_API_KEY    (recommended) https://tavily.com            free ~1000/mo
//   BRAVE_API_KEY                    https://brave.com/search/api free ~2000/mo
//   SERPAPI_API_KEY                  https://serpapi.com          free ~100/mo
//   SEARXNG_URL       self-hosted SearXNG base URL (JSON API on)
// Force a provider with SEARCH_PROVIDER=tavily|brave|serpapi|searxng|duckduckgo.
// With none configured, a best-effort keyless DuckDuckGo Lite fallback is used.

function intEnv(name, fallback) {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const TIMEOUT_MS = intEnv('SEARCH_TIMEOUT_MS', 15000);
const DEFAULT_MAX_RESULTS = intEnv('SEARCH_MAX_RESULTS', 5);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchJson(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    clearTimeout(timer);
    const err = new Error(e && e.name === 'AbortError' ? 'Search request timed out.' : `Search fetch failed: ${e && e.message}`);
    err.code = e && e.name === 'AbortError' ? 'search_timeout' : 'search_unreachable';
    throw err;
  }
  clearTimeout(timer);
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const msg = (parsed && (parsed.error || parsed.message || parsed.detail)) || text.slice(0, 200) || `HTTP ${res.status}`;
    const err = new Error(`${url.replace(/\?.*$/, '')} → ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    err.code = 'search_error';
    err.status = res.status;
    throw err;
  }
  if (!parsed) {
    const err = new Error('Search provider returned non-JSON.');
    err.code = 'search_bad_response';
    throw err;
  }
  return parsed;
}

function clean(str) {
  return String(str == null ? '' : str)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(list, { title, url, snippet }) {
  const out = [];
  const seen = new Set();
  for (const item of list || []) {
    const u = typeof url === 'function' ? url(item) : item[url];
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push({
      title: clean(typeof title === 'function' ? title(item) : item[title]) || u,
      url: String(u),
      snippet: clean(typeof snippet === 'function' ? snippet(item) : item[snippet]).slice(0, 600),
    });
  }
  return out;
}

// ---- providers -----------------------------------------------------------

async function tavily(query, maxResults) {
  const key = process.env.TAVILY_API_KEY;
  const data = await fetchJson(process.env.TAVILY_API_URL || 'https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'User-Agent': UA },
    body: JSON.stringify({ api_key: key, query, max_results: maxResults, search_depth: 'basic', include_answer: false }),
  });
  return normalize(data.results, { title: 'title', url: 'url', snippet: 'content' });
}

async function brave(query, maxResults) {
  const url =
    'https://api.search.brave.com/res/v1/web/search?q=' +
    encodeURIComponent(query) +
    `&count=${maxResults}`;
  const data = await fetchJson(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': process.env.BRAVE_API_KEY, 'User-Agent': UA },
  });
  return normalize(data.web && data.web.results, { title: 'title', url: 'url', snippet: 'description' });
}

async function serpapi(query, maxResults) {
  const url =
    'https://serpapi.com/search.json?engine=google&q=' +
    encodeURIComponent(query) +
    `&num=${maxResults}&api_key=${encodeURIComponent(process.env.SERPAPI_API_KEY || '')}`;
  const data = await fetchJson(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  return normalize(data.organic_results, { title: 'title', url: 'link', snippet: 'snippet' });
}

async function searxng(query, maxResults) {
  const base = String(process.env.SEARXNG_URL || '').replace(/\/+$/, '');
  const url = `${base}/search?q=${encodeURIComponent(query)}&format=json`;
  const data = await fetchJson(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  return normalize(data.results, { title: 'title', url: 'url', snippet: 'content' }).slice(0, maxResults);
}

// Best-effort keyless fallback (no API key). Rate-limited and not guaranteed.
async function duckduckgo(query, maxResults) {
  const parse = (html) => {
    const results = [];
    const seen = new Set();
    const anchorRe = /<a[^>]+href="(\/\/duckduckgo\.com\/l\/\?uddg=[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippets = [...html.matchAll(/class=['"]?result-snippet['"]?[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => clean(m[1]));
    let m;
    let i = 0;
    while ((m = anchorRe.exec(html))) {
      let target = m[1];
      const uddg = target.match(/uddg=([^&]+)/);
      if (uddg) target = decodeURIComponent(uddg[1]);
      if (target.startsWith('//')) target = 'https:' + target;
      if (!/^https?:\/\//i.test(target) || seen.has(target)) {
        i++;
        continue;
      }
      seen.add(target);
      results.push({ title: clean(m[2]) || target, url: target, snippet: snippets[i] || '' });
      i++;
      if (results.length >= maxResults) break;
    }
    return results;
  };

  const grab = async (body) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch('https://lite.duckduckgo.com/lite/', {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        },
        body,
        signal: controller.signal,
      });
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  };

  let html = await grab('q=' + encodeURIComponent(query));
  let results = parse(html);
  if (!results.length) {
    html = await grab('q=' + encodeURIComponent(query) + '&kl=fr-fr');
    results = parse(html);
  }
  if (!results.length) {
    const err = new Error(
      'DuckDuckGo returned no results (likely blocked from this host). ' +
        'Configure a real provider: TAVILY_API_KEY (recommended), BRAVE_API_KEY, SERPAPI_API_KEY or SEARXNG_URL.'
    );
    err.code = 'search_unavailable';
    throw err;
  }
  return results;
}

const PROVIDERS = { tavily, brave, serpapi, searxng, duckduckgo };

function detectProvider() {
  const forced = (process.env.SEARCH_PROVIDER || '').trim().toLowerCase();
  if (forced && PROVIDERS[forced]) return forced;
  if (process.env.TAVILY_API_KEY) return 'tavily';
  if (process.env.BRAVE_API_KEY) return 'brave';
  if (process.env.SERPAPI_API_KEY) return 'serpapi';
  if (process.env.SEARXNG_URL) return 'searxng';
  return '';
}

export function searchProvider() {
  return detectProvider() || 'none';
}

// true when a provider is available. DuckDuckGo only counts when explicitly
// opted in via SEARCH_PROVIDER=duckduckgo (it is best-effort and often blocked).
export function searchConfigured() {
  return !!detectProvider();
}

/**
 * Run a web search.
 * @returns {Promise<{provider:string, query:string, results:Array<{title,url,snippet}>}>}
 */
export async function webSearch(query, { maxResults, provider } = {}) {
  const q = String(query || '').trim();
  if (!q) {
    const err = new Error('Empty search query.');
    err.code = 'empty_query';
    throw err;
  }
  const name = provider && PROVIDERS[provider] ? provider : detectProvider();
  if (!name) {
    const err = new Error(
      'Web search is not configured. Add TAVILY_API_KEY (recommended), BRAVE_API_KEY, ' +
        'SERPAPI_API_KEY or SEARXNG_URL to your environment, then retry with &web=1.'
    );
    err.code = 'search_not_configured';
    err.status = 400;
    throw err;
  }
  const n = Math.min(Math.max(1, maxResults || DEFAULT_MAX_RESULTS), 10);
  const results = await PROVIDERS[name](q, n);
  return { provider: name, query: q, results };
}

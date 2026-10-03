// Web-standard HTTP helpers for Vercel Edge Functions.

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-token',
  'Access-Control-Max-Age': '86400',
};

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS_HEADERS },
  });
}

export function errorResponse(status, message, code, extra) {
  return json({ ok: false, error: { message, code: code || 'error', ...(extra || {}) } }, status);
}

export function preflight(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  return null;
}

export function query(req) {
  const url = new URL(req.url);
  return Object.fromEntries(url.searchParams.entries());
}

/**
 * Parameters for a request: query string, merged with a JSON body for
 * POST/PUT/PATCH (body wins). This lets clients POST { prompt, model, uid,
 * images: [...], history, reset } like the other backends of the site do,
 * avoiding URL-length limits when sending images.
 * The body is read at most once per request.
 */
export async function readParams(req) {
  const params = query(req);
  const method = (req.method || "GET").toUpperCase();
  if (method === "POST" || method === "PUT" || method === "PATCH") {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      try {
        const body = await req.json();
        if (body && typeof body === "object") {
          for (const [k, v] of Object.entries(body)) {
            if (v !== undefined && v !== null) params[k] = v;
          }
        }
      } catch {
        /* corps absent ou invalide — on garde les paramètres d'URL */
      }
    }
  }
  return params;
}

export function requireAuth(req, params) {
  const configured = process.env.API_TOKEN;
  if (!configured) return null;
  const header = req.headers.get('x-api-token') || req.headers.get('authorization') || '';
  const bearer = header.replace(/^Bearer\s+/i, '');
  const supplied = String((params && params.token) || bearer || '').trim();
  if (supplied && supplied === configured) return null;
  return errorResponse(401, 'Missing or invalid API token.', 'unauthorized');
}

export function envInt(name, fallback) {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

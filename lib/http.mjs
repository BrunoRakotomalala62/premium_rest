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

/**
 * Vercel Edge Functions must start sending a response within 25 seconds,
 * otherwise the platform returns a bare 504 (no CORS headers → the browser
 * reports "Failed to fetch"). Long upstream generations routinely exceed that.
 *
 * Strategy:
 *  - If `promise` (a { status, body } result) settles quickly, return a normal
 *    JSON response with the real HTTP status.
 *  - Otherwise switch to a streamed response: flush leading whitespace
 *    immediately (valid JSON padding, keeps the connection under the 25s rule),
 *    then send the full JSON once the upstream answers. Streaming lets the Edge
 *    function run up to its extended duration.
 *
 * The client still gets one JSON document (leading whitespace is ignored by
 * JSON.parse), so `response.json()` works unchanged.
 */
export function raceJsonOrStream(promise, fastMs = 15000) {
  const settled = promise.then((r) => ({ okResult: r })).catch((e) => ({ err: e }));
  const timeout = new Promise((resolve) => setTimeout(() => resolve({ slow: true }), fastMs));

  return Promise.race([settled, timeout]).then((first) => {
    if (!first.slow) {
      if (first.err) {
        const e = first.err;
        return errorResponse(e.status || 500, e.message || 'Internal error', e.code || 'internal_error', e.details);
      }
      return json(first.okResult.body, first.okResult.status);
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(' '.repeat(2048))); // flush < 25s
        try {
          const r = await promise;
          controller.enqueue(encoder.encode(JSON.stringify(r.body)));
        } catch (e) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ ok: false, error: { message: (e && e.message) || 'Internal error', code: (e && e.code) || 'internal_error' } })
            )
          );
        }
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...CORS_HEADERS,
      },
    });
  });
}

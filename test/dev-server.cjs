'use strict';

/**
 * Local dev server for the Edge API. Mirrors Vercel: it turns Node requests
 * into Web `Request` objects, calls the edge handler, and writes back the
 * Web `Response`.   node test/dev-server.cjs   (PORT=3000 by default)
 *
 * Loads .env / .env.local from the project root if present (no dependencies).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

for (const file of ['.env.local', '.env']) {
  const p = path.join(__dirname, '..', file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

// route -> handler module (ESM, edge style)
const routes = {
  '/api': '../api/index.mjs',
  '/api/': '../api/index.mjs',
  '/api/ai': '../api/ai.mjs',
  '/api/vision': '../api/vision.mjs',
  '/api/models': '../api/models.mjs',
  '/api/reset': '../api/reset.mjs',
  '/api/keys': '../api/keys.mjs',
  '/': '../api/index.mjs',
  '/ai': '../api/ai.mjs',
  '/vision': '../api/vision.mjs',
  '/models': '../api/models.mjs',
  '/reset': '../api/reset.mjs',
  '/keys': '../api/keys.mjs',
};

const PORT = process.env.PORT || 3000;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (d) => chunks.push(d));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function toWebRequest(req) {
  const host = req.headers.host || 'localhost';
  const url = `http://${host}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else headers.set(k, v);
  }
  const init = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') init.body = await readBody(req);
  return new Request(url, init);
}

async function sendWebResponse(res, webRes) {
  const headers = {};
  webRes.headers.forEach((value, key) => (headers[key] = value));
  res.writeHead(webRes.status, headers);
  res.end(Buffer.from(await webRes.arrayBuffer()));
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  const modPath = routes[pathname] || routes[pathname.replace(/\/$/, '')];
  if (!modPath) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: { message: `No route for ${pathname}`, code: 'not_found' } }));
    return;
  }
  try {
    const mod = await import(pathToFileURL(path.join(__dirname, modPath)).href);
    const webRes = await mod.default(await toWebRequest(req));
    await sendWebResponse(res, webRes);
  } catch (e) {
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: { message: e.message, code: 'internal_error' } }));
  }
});

server.listen(PORT, () => console.log(`premium_rest dev server (edge emulation) on http://localhost:${PORT}`));

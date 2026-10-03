'use strict';

/**
 * Local dev server — mirrors what Vercel does with /api/*.js.
 *   node test/dev-server.cjs   (defaults to port 3000)
 *
 * Loads .env / .env.local from the project root if present (no dependencies).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// --- tiny .env loader -------------------------------------------------
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

const routes = {
  '/api': require('../api/index.js'),
  '/api/': require('../api/index.js'),
  '/api/ai': require('../api/ai.js'),
  '/api/vision': require('../api/vision.js'),
  '/api/models': require('../api/models.js'),
  '/api/reset': require('../api/reset.js'),
  // convenience aliases (same as the vercel.json rewrites)
  '/': require('../api/index.js'),
  '/ai': require('../api/ai.js'),
  '/vision': require('../api/vision.js'),
  '/models': require('../api/models.js'),
  '/reset': require('../api/reset.js'),
};

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  const handler = routes[pathname] || routes[pathname.replace(/\/$/, '')];
  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: { message: `No route for ${pathname}`, code: 'not_found' } }));
    return;
  }
  try {
    await handler(req, res);
  } catch (e) {
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: { message: e.message, code: 'internal_error' } }));
  }
});

server.listen(PORT, () => console.log(`premium_rest dev server on http://localhost:${PORT}`));

'use strict';

/**
 * End-to-end smoke test against the local dev server.
 * Requires CODECRAFT_API_KEY in the environment or in .env.
 *
 *   node test/smoke.cjs
 *
 * Asserts:
 *   1. GET /api/models returns the catalog
 *   2. GET /api/ai answers and remembers the uid (continuous conversation)
 *   3. GET /api/vision describes an image
 *   4. GET /api/reset clears the conversation
 */

const { spawn } = require('child_process');
const path = require('path');

const PORT = process.env.TEST_PORT || 3211;
const base = `http://127.0.0.1:${PORT}`;

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function get(pathname) {
  const res = await fetch(base + pathname);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  const server = spawn(process.execPath, [path.join(__dirname, 'dev-server.cjs')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((r) => setTimeout(r, 800));

  try {
    console.log('1. /api/models');
    const models = await get('/api/models');
    check('200', models.status === 200, `got ${models.status}`);
    check('has 33 models', models.body.count === 33, `count=${models.body.count}`);
    check('default text model', !!models.body.defaults.text);

    console.log('2. /api/ai continuous conversation');
    const uid = 'smoke-' + Date.now();
    const a = await get(`/api/ai?prompt=${encodeURIComponent('Je m’appelle Camille. Réponds en une phrase.')}&uid=${uid}`);
    check('first call 200', a.status === 200, JSON.stringify(a.body).slice(0, 200));
    check('has reply', typeof a.body.reply === 'string' && a.body.reply.length > 0);
    const b = await get(`/api/ai?prompt=${encodeURIComponent('Comment je m’appelle ?')}&uid=${uid}`);
    check('second call 200', b.status === 200);
    const remembered = typeof b.body.reply === 'string' && /camille/i.test(b.body.reply);
    check('remembers the name across calls', remembered, `reply="${(b.body.reply || '').slice(0, 120)}"`);

    console.log('3. /api/vision');
    const v = await get(
      `/api/vision?prompt=${encodeURIComponent('Décris cette photo en une phrase.')}` +
        `&image=${encodeURIComponent('https://upload.wikimedia.org/wikipedia/commons/3/3a/Cat03.jpg')}&uid=${uid}`
    );
    check('vision 200', v.status === 200, JSON.stringify(v.body).slice(0, 200));
    check('vision reply non-empty', typeof v.body.reply === 'string' && v.body.reply.length > 0);

    console.log('4. /api/ai with image param (vision alias)');
    const v2 = await get(
      `/api/ai?prompt=${encodeURIComponent('Que vois-tu ?')}` +
        `&image=${encodeURIComponent('https://upload.wikimedia.org/wikipedia/commons/3/3a/Cat03.jpg')}&uid=${uid}`
    );
    check('routes to vision', v2.status === 200 && v2.body.images === 1, JSON.stringify(v2.body).slice(0, 150));

    console.log('5. /api/reset');
    const r = await get(`/api/reset?uid=${uid}`);
    check('reset 200', r.status === 200 && r.body.ok === true);

    console.log('6. error handling');
    const e1 = await get('/api/ai?uid=123');
    check('missing prompt -> 400', e1.status === 400 && e1.body.error.code === 'missing_prompt');
    const e2 = await get('/api/ai?prompt=hi&model=does-not-exist');
    check('unknown model -> 400', e2.status === 400 && e2.body.error.code === 'model_not_found');
  } finally {
    server.kill();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

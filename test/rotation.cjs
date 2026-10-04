'use strict';

/**
 * Rotation smoke test — no real API key or network needed (fetch is stubbed).
 *
 *   node test/rotation.cjs
 *
 * Covers:
 *   1. failover: an exhausted key (402 quota) rotates to the next key
 *   2. stickiness: once a key is benched, the next call uses the healthy key only
 *   3. all keys exhausted -> error flagged keys_exhausted
 *   4. non-key errors (400) are NOT retried on other keys
 *   5. failure classification (quota vs transient rate limit)
 */

process.env.CODECRAFT_BASE_URL = 'https://codecraft.test/v1';
process.env.CODECRAFT_API_KEYS = 'cc_bad_0001, cc_good_0002';
process.env.KEY_STRATEGY = 'failover';

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  \u2713 ${name}`);
  } else {
    fail++;
    console.log(`  \u2717 ${name}${detail ? ` \u2014 ${detail}` : ''}`);
  }
}

const HOME = path.join(__dirname, '..');
const importEsm = (rel) => import(pathToFileURL(path.join(HOME, rel)).href);

function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}

const SUCCESS_BODY = {
  id: 'chatcmpl-test',
  model: 'claude-opus-5',
  choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
  usage: { total_tokens: 12 },
};

let mode = 'default';
let calls = [];

global.fetch = async (url, opts) => {
  const auth = (opts && opts.headers && opts.headers.Authorization) || '';
  const key = auth.replace(/^Bearer\s+/, '');
  calls.push(key);

  if (mode === 'all-fail') {
    return jsonResponse(402, { error: { message: 'monthly quota exhausted', code: 'quota_exceeded' } });
  }
  if (mode === 'bad-request') {
    return jsonResponse(400, { error: { message: 'unknown model', code: 'invalid_request_error' } });
  }
  if (key === 'cc_bad_0001') {
    return jsonResponse(402, { error: { message: 'monthly quota exhausted', code: 'quota_exceeded' } });
  }
  return jsonResponse(200, SUCCESS_BODY);
};

const chat = () => ({ model: 'claude-opus-5', messages: [{ role: 'user', content: 'hi' }] });

(async () => {
  const cc = await importEsm('lib/codecraft.mjs');
  const keys = await importEsm('lib/keys.mjs');

  // 1. failover
  keys.resetHealth();
  calls = [];
  const r1 = await cc.chat(chat());
  check('failover: reply returned', r1.reply === 'ok', JSON.stringify(r1));
  check('failover: key1 then key2', calls.join(',') === 'cc_bad_0001,cc_good_0002', calls.join(','));
  check('failover: bad key benched', keys.snapshot()[0].status === 'cooling', JSON.stringify(keys.snapshot()));

  // 2. stickiness — bad key is in cooldown, only the good one is used
  calls = [];
  const r2 = await cc.chat(chat());
  check('sticky: reply returned', r2.reply === 'ok');
  check('sticky: only healthy key used', calls.join(',') === 'cc_good_0002', calls.join(','));
  check('sticky: rotation enabled', keys.keyCount() === 2 && keys.strategy() === 'failover');

  // 3. all keys exhausted
  keys.resetHealth();
  mode = 'all-fail';
  calls = [];
  let err3 = null;
  try {
    await cc.chat(chat());
  } catch (e) {
    err3 = e;
  }
  mode = 'default';
  check('exhausted: throws', !!err3);
  check('exhausted: code=keys_exhausted', err3 && err3.code === 'keys_exhausted', err3 && err3.code);
  check('exhausted: upstream code kept', err3 && err3.upstream_code === 'quota_exceeded', err3 && err3.upstream_code);
  check('exhausted: tried both keys', calls.length === 2, `calls=${calls.length}`);
  check('exhausted: status 402', err3 && err3.status === 402, err3 && String(err3.status));

  // 4. non-key error is not retried
  keys.resetHealth();
  mode = 'bad-request';
  calls = [];
  let err4 = null;
  try {
    await cc.chat(chat());
  } catch (e) {
    err4 = e;
  }
  mode = 'default';
  check('400: propagated as-is', err4 && err4.code === 'invalid_request_error', err4 && err4.code);
  check('400: only one attempt (no key burned)', calls.length === 1, `calls=${calls.length}`);

  // 5. classification
  const cQuota = keys.classifyFailure({ upstreamStatus: 429, message: 'monthly quota exceeded' });
  check('classify: 429+quota -> quota', cQuota.rotatable && cQuota.type === 'quota', JSON.stringify(cQuota));
  const cRate = keys.classifyFailure({ upstreamStatus: 429, message: 'rate limit reached', retryAfterSeconds: 30 });
  check('classify: 429 rate -> retry-after honored', cRate.rotatable && cRate.type === 'rate_limit' && cRate.cooldownMs === 30000, JSON.stringify(cRate));
  const c400 = keys.classifyFailure({ upstreamStatus: 400, message: 'bad request' });
  check('classify: 400 -> not rotatable', c400.rotatable === false, JSON.stringify(c400));
  const c401 = keys.classifyFailure({ upstreamStatus: 401, message: 'invalid api key' });
  check('classify: 401 -> invalid_key', c401.rotatable && c401.type === 'invalid_key', JSON.stringify(c401));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

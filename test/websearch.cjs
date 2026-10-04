'use strict';

/**
 * Web search tests — no network, fetch is stubbed.
 *
 *   node test/websearch.cjs
 *
 * Covers:
 *   1. full tool-calling loop: tool_call -> search -> final grounded answer
 *   2. sources are collected and deduplicated
 *   3. a search failure is reported back to the model instead of crashing
 *   4. provider selection + normalization (Tavily + DuckDuckGo parsing)
 */

process.env.CODECRAFT_API_KEY = 'cc_test'; // satisfied by the stubbed fetch below
process.env.TAVILY_API_KEY = 'tvly-test';
process.env.TAVILY_API_URL = 'https://search.test/tavily';
process.env.SEARCH_PROVIDER = 'tavily';

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

const DUMMY = { model: 'claude-opus-5', messages: [{ role: 'user', content: 'hi' }] };

let ccCalls = 0;
let searchCalls = [];
let ccScript = [];
let searchThrows = false;

function joke(extra) {
  return new Response(JSON.stringify(extra), { status: 200, headers: { 'content-type': 'application/json' } });
}

global.fetch = async (url, opts) => {
  const href = String(url);

  if (href.includes('/chat/completions')) {
    ccCalls++;
    const step = ccScript.shift() || { reply: 'done' };
    const message = step.toolCalls
      ? { role: 'assistant', content: step.reply || null, tool_calls: step.toolCalls }
      : { role: 'assistant', content: step.reply };
    return joke({
      id: 'chatcmpl-' + ccCalls,
      model: 'claude-opus-5',
      choices: [{ index: 0, message, finish_reason: step.toolCalls ? 'tool_calls' : 'stop' }],
      usage: { total_tokens: 10 },
    });
  }

  if (href.includes('/tavily')) {
    searchCalls.push(JSON.parse(opts.body || '{}').query);
    if (searchThrows) return new Response('{"error":"rate limited"}', { status: 429, headers: { 'content-type': 'application/json' } });
    return joke({
      results: [
        { title: 'Bitcoin price', url: 'https://example.com/btc', content: 'BTC is 123,456 USD <b>today</b>' },
        { title: 'Dup', url: 'https://example.com/btc', content: 'duplicate url' },
        { title: 'Source two', url: 'https://example.com/2', content: 'other' },
      ],
    });
  }

  throw new Error('unexpected fetch: ' + href);
};

(async () => {
  const ws = await importEsm('lib/websearch.mjs');
  const search = await importEsm('lib/search.mjs');

  // 1 + 2. full loop with dedupe
  ccCalls = 0;
  searchCalls = [];
  ccScript = [
    {
      reply: 'Je cherche.',
      toolCalls: [{ id: 'call_1', type: 'function', function: { name: 'web_search', arguments: JSON.stringify({ query: 'bitcoin price' }) } }],
    },
    { reply: 'Le BTC est à 123 456 USD (source : example.com).' },
  ];
  const r = await ws.chatWithWebSearch({ model: 'claude-opus-5', messages: DUMMY.messages });
  check('loop: final reply returned', /123/.test(r.result.reply || ''), r.result.reply);
  check('loop: 2 model calls (tool then answer)', ccCalls === 2, `ccCalls=${ccCalls}`);
  check('loop: search query executed', searchCalls.join(',') === 'bitcoin price', searchCalls.join(','));
  check('loop: 1 search round', r.rounds === 1, String(r.rounds));
  check('loop: 2 model calls', r.modelCalls === 2, String(r.modelCalls));
  check('loop: provider=tavily', r.provider === 'tavily', r.provider);
  check('loop: sources deduped (2 keep)', r.sources.length === 2, JSON.stringify(r.sources));
  check('loop: snippet cleaned of HTML', r.sources[0].snippet === 'BTC is 123,456 USD today', r.sources[0].snippet);

  // 2b. no tool call -> single call, no sources
  ccCalls = 0;
  ccScript = [{ reply: 'Pas besoin de chercher.' }];
  const r2 = await ws.chatWithWebSearch({ model: 'claude-opus-5', messages: DUMMY.messages });
  check('no-tool: single model call', ccCalls === 1, `ccCalls=${ccCalls}`);
  check('no-tool: sources empty', r2.sources.length === 0);

  // 3. search failure surfaced to the model, no crash
  ccCalls = 0;
  searchThrows = true;
  ccScript = [
    { toolCalls: [{ id: 'call_x', type: 'function', function: { name: 'web_search', arguments: '{"query":"x"}' } }] },
    { reply: 'Je n\u2019ai pas pu chercher.' },
  ];
  const r3 = await ws.chatWithWebSearch({ model: 'claude-opus-5', messages: DUMMY.messages });
  searchThrows = false;
  check('search-error: loop completes', /pu chercher/.test(r3.result.reply || ''), r3.result.reply);
  check('search-error: recorded with error', r3.searches[0] && !!r3.searches[0].error, JSON.stringify(r3.searches));

  // 4. provider helpers
  check('provider: detected as tavily', search.searchProvider() === 'tavily');
  check('provider: configured=true for keyed provider', search.searchConfigured() === true);
  const s = await search.webSearch('hello');
  check('search: normalize returns results', s.results.length === 2 && s.results[0].url === 'https://example.com/btc', JSON.stringify(s.results));

  // 5. DuckDuckGo parser (keyless fallback)
  const ddgHtml = `
    <a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.binance.com%2Ffr%2Fprice%2Fbitcoin" class='result-link'>Binance BTC</a>
    <td class='result-snippet'>Cours du <b>Bitcoin</b> en direct</td>
    <a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fcoinmarketcap.com%2Fbtc" class='result-link'>CMC</a>
    <td class='result-snippet'>Prix BTC</td>`;
  global.fetch = async () => new Response(ddgHtml, { status: 200 });
  const ddg = await importEsm('lib/search.mjs');
  const d = await ddg.webSearch('bitcoin', { provider: 'duckduckgo' });
  check('ddg: parsed 2 results', d.results.length === 2, JSON.stringify(d.results));
  check('ddg: decodes uddg url', d.results[0].url === 'https://www.binance.com/fr/price/bitcoin', d.results[0] && d.results[0].url);
  check('ddg: cleans snippet', d.results[0].snippet === 'Cours du Bitcoin en direct', d.results[0].snippet);

  // 6. ?web=1 with no provider -> 400 search_not_configured (no model call)
  delete process.env.TAVILY_API_KEY;
  delete process.env.SEARCH_PROVIDER;
  const ai = await importEsm('lib/ai.mjs');
  const nc = await ai.runChat({ prompt: 'x', web: '1', nostore: '1' });
  check(
    'web=1 sans provider -> 400 search_not_configured',
    nc.status === 400 && nc.body.error && nc.body.error.code === 'search_not_configured',
    JSON.stringify(nc.body)
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Tool-calling web search agent loop — Edge/ESM.
//
// CodeCraft advertises a `web_search` capability per model but exposes no way to
// actually enable it (verified: no parameter triggers it). So we implement web
// search ourselves with the documented function-calling API:
//   1. we declare a `web_search` tool;
//   2. the model answers with finish_reason=tool_calls;
//   3. we run the search (lib/search.mjs) and return a `tool` message;
//   4. the model writes the final answer, grounded on the results.

import * as cc from './codecraft.mjs';
import { webSearch, searchProvider } from './search.mjs';

function intEnv(name, fallback) {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description:
      'Search the public web for up-to-date information. Use it whenever the answer depends on recent events, ' +
      'live data (prices, weather, scores), or facts you are not sure about. Returns a list of results with title, url and snippet.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query, in the language most likely to give good results.' },
      },
      required: ['query'],
    },
  },
};

function dedupeSources(list) {
  const seen = new Set();
  const out = [];
  for (const s of list) {
    const key = s && s.url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Chat with web search available as a tool.
 * @returns {{result:object, sources:Array, searches:Array, rounds:number, modelCalls:number, provider:string}}
 */
export async function chatWithWebSearch({ model, messages, maxTokens, temperature, maxResults, maxRounds }) {
  const tools = [WEB_SEARCH_TOOL];
  const convo = messages.slice();
  const sources = [];
  const searches = [];
  const limit = maxRounds || intEnv('WEB_SEARCH_MAX_ROUNDS', 3);
  let modelCalls = 0;
  let rounds = 0;

  while (modelCalls < limit) {
    modelCalls++;
    const res = await cc.chat({ model, messages: convo, tools, toolChoice: 'auto', maxTokens, temperature });
    if (!res.toolCalls || !res.toolCalls.length) {
      return { result: res, sources: dedupeSources(sources), searches, rounds, modelCalls, provider: searchProvider() };
    }
    rounds++;

    // Echo the assistant turn (with its tool_calls) verbatim, then one tool message per call.
    convo.push({ role: 'assistant', content: res.reply || null, tool_calls: res.toolCalls });

    for (const call of res.toolCalls) {
      let query = '';
      try {
        query = JSON.parse((call.function && call.function.arguments) || '{}').query || '';
      } catch {
        /* malformed arguments */
      }
      if (!query) {
        convo.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'missing query' }) });
        continue;
      }
      try {
        const s = await webSearch(query, { maxResults });
        searches.push({ query, provider: s.provider, results: s.results.length });
        sources.push(...s.results);
        convo.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({ query, results: s.results }),
        });
      } catch (e) {
        searches.push({ query, error: e.message });
        convo.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ query, error: e.message }) });
      }
    }
  }

  // Round budget exhausted: ask for a final answer without tools.
  const res = await cc.chat({ model, messages: convo, maxTokens, temperature });
  return { result: res, sources: dedupeSources(sources), searches, rounds, modelCalls, provider: searchProvider() };
}

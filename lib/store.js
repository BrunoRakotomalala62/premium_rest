'use strict';

/**
 * Conversation memory store.
 *
 * CodeCraft's upstream API is stateless: to keep a conversation going we must
 * resend the full message history on every call. This module persists that
 * history keyed by `uid`.
 *
 * Two backends:
 *  - Upstash Redis REST (durable, recommended on Vercel) when
 *    UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set.
 *  - In-memory Map (default fallback, best effort) otherwise. On Vercel this
 *    survives only within a single warm lambda instance, which is fine for
 *    light use but loses context on cold starts.
 *
 * To plug another KV (Vercel KV, Redis, Postgres...), implement the same
 * four methods: getHistory, saveHistory, appendExchange, clear.
 */

const { envInt } = require('./http');

const TTL_SECONDS = envInt('CONVERSATION_TTL_SECONDS', 86400); // 24h
const MAX_MESSAGES = envInt('MAX_HISTORY_MESSAGES', 24); // ~12 exchanges

function keyFor(uid) {
  return `premium_rest:conv:${uid}`;
}

/* ------------------------------------------------------------------ */
/* In-memory backend                                                   */
/* ------------------------------------------------------------------ */

const memory = new Map(); // key -> { messages, expiresAt }

const memoryStore = {
  async getHistory(uid) {
    const entry = memory.get(keyFor(uid));
    if (!entry) return [];
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      memory.delete(keyFor(uid));
      return [];
    }
    return entry.messages;
  },
  async saveHistory(uid, messages) {
    memory.set(keyFor(uid), {
      messages,
      expiresAt: Date.now() + TTL_SECONDS * 1000,
    });
  },
  async clear(uid) {
    memory.delete(keyFor(uid));
  },
};

/* ------------------------------------------------------------------ */
/* Upstash Redis REST backend                                          */
/* ------------------------------------------------------------------ */

function upstashStore(baseUrl, token) {
  const root = baseUrl.replace(/\/+$/, '');
  const headers = { Authorization: `Bearer ${token}` };

  async function cmd(path, init) {
    const res = await fetch(`${root}/${path}`, { ...init, headers: { ...headers, ...(init && init.headers) } });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Upstash ${path} failed: ${res.status} ${text.slice(0, 200)}`);
    }
    return res.json();
  }

  return {
    async getHistory(uid) {
      const data = await cmd(`get/${encodeURIComponent(keyFor(uid))}`);
      if (!data || data.result == null) return [];
      try {
        const parsed = JSON.parse(data.result);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },
    async saveHistory(uid, messages) {
      await cmd(`set/${encodeURIComponent(keyFor(uid))}?EX=${TTL_SECONDS}`, {
        method: 'POST',
        body: JSON.stringify(messages),
      });
    },
    async clear(uid) {
      await cmd(`del/${encodeURIComponent(keyFor(uid))}`, { method: 'POST' });
    },
  };
}

/* ------------------------------------------------------------------ */

const backend =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? upstashStore(process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN)
    : memoryStore;

const backendName =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? 'upstash' : 'memory';

/** Trim history to the most recent MAX_MESSAGES, never cutting mid tool pair. */
function trim(messages) {
  if (messages.length <= MAX_MESSAGES) return messages;
  return messages.slice(messages.length - MAX_MESSAGES);
}

async function getHistory(uid) {
  if (!uid) return [];
  return trim(await backend.getHistory(String(uid)));
}

/**
 * Append one user+assistant exchange and persist.
 * `extra` (e.g. an image turn) is merged into the user message if provided.
 */
async function appendExchange(uid, userMessage, assistantMessage) {
  if (!uid) return [];
  const history = await backend.getHistory(String(uid));
  history.push(userMessage);
  if (assistantMessage) history.push(assistantMessage);
  const trimmed = trim(history);
  await backend.saveHistory(String(uid), trimmed);
  return trimmed;
}

async function clear(uid) {
  if (!uid) return;
  await backend.clear(String(uid));
}

module.exports = { getHistory, appendExchange, clear, backendName, TTL_SECONDS, MAX_MESSAGES };

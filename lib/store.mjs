// Conversation memory store — runs on Vercel Edge (Web APIs only).
//
// CodeCraft's upstream is stateless: to keep a conversation going we resend the
// full history on every call. This module persists that history keyed by `uid`.
//
//  - Upstash Redis REST (durable, REQUIRED for reliable memory on Edge) when
//    UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set.
//  - In-memory Map fallback. On Edge this is per-isolate and short-lived, so
//    continuity is only best-effort. Use Upstash in production.

import { envInt } from './http.mjs';

const TTL_SECONDS = envInt('CONVERSATION_TTL_SECONDS', 86400); // 24h
const MAX_MESSAGES = envInt('MAX_HISTORY_MESSAGES', 24); // ~12 exchanges

function keyFor(uid) {
  return `premium_rest:conv:${uid}`;
}

const memory = new Map();

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
    memory.set(keyFor(uid), { messages, expiresAt: Date.now() + TTL_SECONDS * 1000 });
  },
  async clear(uid) {
    memory.delete(keyFor(uid));
  },
};

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

const hasUpstash = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const backend = hasUpstash
  ? upstashStore(process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN)
  : memoryStore;

export const backendName = hasUpstash ? 'upstash' : 'memory';

function trim(messages) {
  if (messages.length <= MAX_MESSAGES) return messages;
  return messages.slice(messages.length - MAX_MESSAGES);
}

export async function getHistory(uid) {
  if (!uid) return [];
  return trim(await backend.getHistory(String(uid)));
}

export async function appendExchange(uid, userMessage, assistantMessage) {
  if (!uid) return [];
  const history = await backend.getHistory(String(uid));
  history.push(userMessage);
  if (assistantMessage) history.push(assistantMessage);
  const trimmed = trim(history);
  await backend.saveHistory(String(uid), trimmed);
  return trimmed;
}

export async function clear(uid) {
  if (!uid) return;
  await backend.clear(String(uid));
}

export { TTL_SECONDS, MAX_MESSAGES };

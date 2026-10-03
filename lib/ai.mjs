// Shared request logic for the AI routes (Edge / ESM).
// Each function returns { status, body } so handlers stay thin.

import * as cc from './codecraft.mjs';
import {
  DEFAULT_MODEL,
  VISION_DEFAULT_MODEL,
  MODEL_CATALOG,
  resolveModel,
} from './models.mjs';
import * as store from './store.mjs';

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);
const isTruthy = (v) => typeof v === 'string' && TRUTHY.has(v.toLowerCase());

function pickModel(raw, fallback) {
  if (!raw) return { model: fallback };
  const resolved = resolveModel(raw);
  if (!resolved) {
    return {
      error: {
        status: 400,
        body: {
          ok: false,
          error: {
            message: `Unknown model "${raw}".`,
            code: 'model_not_found',
            param: 'model',
            hint: 'Call GET /api/models for the full list, or use an alias like claude-5, mythos, luna, terra, sol.',
            available_models: MODEL_CATALOG.map((m) => m.id),
          },
        },
      },
    };
  }
  return { model: resolved };
}

function parseList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  return String(value)
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:' || value.startsWith('data:image/');
  } catch {
    return false;
  }
}

export async function runChat(params) {
  const prompt = (params.prompt || params.q || '').trim();
  if (!prompt) {
    return {
      status: 400,
      body: { ok: false, error: { message: 'Missing required query param "prompt".', code: 'missing_prompt', param: 'prompt' } },
    };
  }

  const picked = pickModel(params.model, process.env.DEFAULT_MODEL || DEFAULT_MODEL);
  if (picked.error) return picked.error;
  const model = picked.model;

  const uid = params.uid ? String(params.uid).trim() : 'anonymous';
  const system = params.system ? String(params.system) : null;
  const noStore =
    isTruthy(params.nostore) || isTruthy(params['no-store']) || isTruthy(params.stateless);
  const remember = !noStore;

  let history = [];
  if (params.history) {
    try {
      const parsed = JSON.parse(params.history);
      if (Array.isArray(parsed)) history = parsed;
    } catch {
      return {
        status: 400,
        body: { ok: false, error: { message: '"history" must be a JSON array of messages.', code: 'invalid_history', param: 'history' } },
      };
    }
  } else if (remember) {
    if (isTruthy(params.reset)) await store.clear(uid);
    history = await store.getHistory(uid);
  }

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  for (const m of history) {
    if (m && m.role && m.content) messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: 'user', content: prompt });

  const result = await cc.chat({
    model,
    messages,
    maxTokens: params.max_tokens ? parseInt(params.max_tokens, 10) : undefined,
    temperature: params.temperature != null && params.temperature !== '' ? parseFloat(params.temperature) : undefined,
    topP: params.top_p != null && params.top_p !== '' ? parseFloat(params.top_p) : undefined,
  });

  let updated = null;
  if (remember) {
    updated = await store.appendExchange(uid, { role: 'user', content: prompt }, { role: 'assistant', content: result.reply });
  }

  const body = {
    ok: true,
    uid,
    model: result.model || model,
    reply: result.reply,
    finish_reason: result.finishReason,
    usage: result.usage,
    turns: Math.ceil(messages.length / 2),
    conversation_backend: store.backendName,
    id: result.id,
  };
  if (isTruthy(params.return_history) && updated) body.messages = updated;
  return { status: 200, body };
}

export async function runVision(params) {
  const prompt = (params.prompt || params.q || '').trim();
  if (!prompt) {
    return {
      status: 400,
      body: { ok: false, error: { message: 'Missing required query param "prompt".', code: 'missing_prompt', param: 'prompt' } },
    };
  }

  const images = parseList(params.image).concat(parseList(params.images));
  if (images.length === 0) {
    return {
      status: 400,
      body: { ok: false, error: { message: 'Missing required query param "image" (public URL or data: URI).', code: 'missing_image', param: 'image' } },
    };
  }
  const bad = images.filter((u) => !isHttpUrl(u));
  if (bad.length) {
    return {
      status: 400,
      body: { ok: false, error: { message: `Invalid image URL(s): ${bad.join(', ')}`, code: 'invalid_image_url', param: 'image' } },
    };
  }

  const picked = pickModel(params.model, process.env.VISION_DEFAULT_MODEL || VISION_DEFAULT_MODEL);
  if (picked.error) return picked.error;
  const model = picked.model;

  const modelInfo = MODEL_CATALOG.find((m) => m.id === model);
  if (modelInfo && !modelInfo.vision) {
    return {
      status: 400,
      body: {
        ok: false,
        error: {
          message: `Model "${model}" does not support image input.`,
          code: 'unsupported_content',
          param: 'model',
          hint: 'Pick a vision-capable model, e.g. claude-opus-5, claude-sonnet-5, gpt-5.6-luna, gpt-5.6-terra, gemini-3.7-flash.',
          vision_models: MODEL_CATALOG.filter((m) => m.vision).map((m) => m.id),
        },
      },
    };
  }

  const uid = params.uid ? String(params.uid).trim() : null;
  const remember = uid && !isTruthy(params.nostore) && !isTruthy(params['no-store']);

  if (remember && isTruthy(params.reset)) await store.clear(uid);

  const result = await cc.vision({
    model,
    prompt,
    imageUrls: images,
    maxTokens: params.max_tokens ? parseInt(params.max_tokens, 10) : undefined,
  });

  if (remember) {
    const label = images.length === 1 ? '[image]' : `[${images.length} images]`;
    await store.appendExchange(
      uid,
      { role: 'user', content: `${label} ${prompt}` },
      { role: 'assistant', content: result.reply }
    );
  }

  return {
    status: 200,
    body: {
      ok: true,
      uid,
      model: result.model || model,
      reply: result.reply,
      finish_reason: result.finishReason,
      images: images.length,
      usage: result.usage,
      conversation_backend: store.backendName,
      id: result.id,
    },
  };
}

export { listModels } from './models.mjs';

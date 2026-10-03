'use strict';

/**
 * Tiny HTTP helpers shared by every Vercel serverless handler.
 * Handlers only use plain Node req/res APIs so they work identically
 * on Vercel and in the local dev server (test/dev-server.cjs).
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-token',
  'Access-Control-Max-Age': '86400',
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...CORS_HEADERS,
  });
  res.end(payload);
}

function sendError(res, status, message, code, extra) {
  return sendJson(res, status, {
    ok: false,
    error: { message, code: code || 'error', ...(extra || {}) },
  });
}

/** Parse the query string out of any Node request (Vercel or local). */
function getQuery(req) {
  const host = req.headers && req.headers.host ? req.headers.host : 'localhost';
  const url = new URL(req.url || '/', `https://${host}`);
  return Object.fromEntries(url.searchParams.entries());
}

function getPath(req) {
  const host = req.headers && req.headers.host ? req.headers.host : 'localhost';
  return new URL(req.url || '/', `https://${host}`).pathname;
}

function handlePreflight(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return true;
  }
  return false;
}

/**
 * Optional client-side gate. If API_TOKEN is set in the environment, callers
 * must present it as `x-api-token` header, `Authorization: Bearer <token>`,
 * or `?token=<token>`. Disabled (open) when API_TOKEN is unset.
 * Returns true when the request was already answered (blocked).
 */
function requireAuth(req, res, params) {
  const configured = process.env.API_TOKEN;
  if (!configured) return false;
  const header = (req.headers && (req.headers['x-api-token'] || req.headers['authorization'])) || '';
  const bearer = header.replace(/^Bearer\s+/i, '');
  const supplied = String((params && params.token) || bearer || '').trim();
  if (supplied && supplied === configured) return false;
  sendError(res, 401, 'Missing or invalid API token.', 'unauthorized');
  return true;
}

function envInt(name, fallback) {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

module.exports = { sendJson, sendError, getQuery, getPath, handlePreflight, requireAuth, CORS_HEADERS, envInt };

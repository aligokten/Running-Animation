#!/usr/bin/env node
/**
 * Minimal Strava OAuth token proxy.
 *
 * Some browsers refuse the direct call to https://www.strava.com/oauth/token
 * because of CORS. This tiny server forwards the exchange and adds the headers
 * the browser needs. It stores nothing and only accepts requests from
 * localhost by default.
 *
 *   node server/strava-proxy.mjs        # listens on http://localhost:8788
 *
 * The dev server proxies /api/strava/* here automatically (see vite.config.ts).
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.STRAVA_PROXY_PORT ?? 8788);
const ORIGIN = process.env.STRAVA_PROXY_ORIGIN ?? '*';

const send = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 64 * 1024) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (!req.url?.startsWith('/api/strava/token') && req.url !== '/token') {
    return send(res, 404, { error: 'Not found' });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST' });

  try {
    const body = await readBody(req);
    const upstream = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const json = await upstream.json();
    send(res, upstream.status, json);
  } catch (err) {
    send(res, 502, { error: String(err) });
  }
}).listen(PORT, () => {
  console.log(`Strava token proxy: http://localhost:${PORT}/api/strava/token`);
});

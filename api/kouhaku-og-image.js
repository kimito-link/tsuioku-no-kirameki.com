// @ts-nocheck
/**
 * 共有用 JPEG。焼いた画像が Redis にあればそれを返し、無ければ同梱の紅白カードを返す。
 * 公式ページへは行かない。ニコニコの画像は保存も中継もしない。
 *
 *   GET  /api/kouhaku-og-image?kind=board
 *   GET  /api/kouhaku-og-image?user=数字
 *   POST /api/kouhaku-og-image?ingest=1   x-share-key。body { id, jpegBase64 }
 */
import { readFileSync } from 'node:fs';
import { upstash } from './live-ranking.js';
import { ogImageKey } from '../src/server/kouhakuRead.js';

const FALLBACK = new URL('../tsuioku-no-kirameki/images/og-kouhaku.jpg', import.meta.url);
const MAX_B64 = 500000;

function authorized(req) {
  const want = process.env.STATUS_INGEST_KEY;
  const sent = String((req.headers && req.headers['x-share-key']) || '');
  return Boolean(want) && sent === want;
}

function imageId(query) {
  const user = String((query && query.user) || '');
  if (/^\d{1,16}$/.test(user)) return user;
  return 'board';
}

function sendJpeg(res, bytes) {
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(200).end(bytes);
}

function sendFallback(res) {
  try {
    sendJpeg(res, readFileSync(FALLBACK));
  } catch {
    res.status(404).end();
  }
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    res.setHeader('Cache-Control', 'no-store');
    if (String((req.query && req.query.ingest) || '') !== '1' || !authorized(req)) {
      res.status(401).json({ ok: false, action: 'unauthorized' });
      return;
    }
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      res.status(503).json({ ok: false, action: 'not-configured' });
      return;
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const id = String(body.id || '');
    const jpegBase64 = String(body.jpegBase64 || '');
    if (id !== 'board' && !/^\d{1,16}$/.test(id)) {
      res.status(400).json({ ok: false, error: 'bad id' });
      return;
    }
    if (jpegBase64.length < 100 || jpegBase64.length > MAX_B64) {
      res.status(400).json({ ok: false, error: 'bad image' });
      return;
    }
    let bytes;
    try {
      bytes = Buffer.from(jpegBase64, 'base64');
    } catch {
      res.status(400).json({ ok: false, error: 'bad image' });
      return;
    }
    if (bytes.length < 100 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      res.status(400).json({ ok: false, error: 'not jpeg' });
      return;
    }
    await upstash(['SET', ogImageKey(id), jpegBase64, 'EX', String(60 * 24 * 60 * 60)]);
    res.status(200).json({ ok: true, stored: true, id, bytes: bytes.length });
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  const id = imageId(req.query);
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const raw = await upstash(['GET', ogImageKey(id)]);
      if (typeof raw === 'string' && raw) {
        const bytes = Buffer.from(raw, 'base64');
        if (bytes.length > 100 && bytes[0] === 0xff && bytes[1] === 0xd8) {
          sendJpeg(res, bytes);
          return;
        }
      }
    } catch {
      /* 同梱カードへ */
    }
  }
  sendFallback(res);
}

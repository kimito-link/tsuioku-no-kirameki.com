// @ts-nocheck
/**
 * status 受け口 Vercel Serverless Function。
 *
 *   POST /api/status   拡張が録った概要 jsonBlob を保存する(書き込みキー認証)。
 *   GET  /api/status?v=<token>   保存済みの概要を取り出す(閲覧ページが叩く)。
 *
 * 設計:
 *   - ストアは Upstash Redis(Vercel マーケットプレイス)。REST のみで叩くため npm 依存ゼロ。
 *     env: KV_REST_API_URL / KV_REST_API_TOKEN(Upstash 連携で自動注入)。
 *   - 書き込み認証: ヘッダ x-share-key == env STATUS_INGEST_KEY。
 *   - 閲覧トークン: クエリ/ボディの v(推測困難な長い文字列)。キーは status:latest:<v>。
 *   - TTL 7 日(放置データの自然消滅)。
 *
 *   ※ 概要だけスコープ。コメント全文は将来。
 */

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 日
const VIEW_TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;

/** Upstash REST へ 1 コマンド送る。失敗時は例外。 */
async function upstash(command) {
  const base = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!base || !token) {
    throw new Error('KV env missing');
  }
  const res = await fetch(base, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  if (!res.ok) {
    throw new Error(`upstash ${res.status}`);
  }
  const json = await res.json();
  return json?.result;
}

function readBody(req) {
  // Vercel Node Functions は req.body を自動 parse することがあるが、
  // 念のため両対応(既に object ならそのまま)。
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'POST') {
      const ingestKey = process.env.STATUS_INGEST_KEY;
      const sent = req.headers['x-share-key'];
      if (!ingestKey || sent !== ingestKey) {
        res.status(401).json({ ok: false, error: 'unauthorized' });
        return;
      }
      const body = readBody(req);
      if (!body || typeof body !== 'object') {
        res.status(400).json({ ok: false, error: 'bad body' });
        return;
      }
      const token = String(body.v || req.headers['x-view-token'] || '');
      if (!VIEW_TOKEN_RE.test(token)) {
        res.status(400).json({ ok: false, error: 'bad view token' });
        return;
      }
      // v はストレージに含めない(ペイロードのみ保存)。
      const payload = { ...body };
      delete payload.v;
      await upstash(['SET', `status:latest:${token}`, JSON.stringify(payload), 'EX', String(TTL_SECONDS)]);
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'GET') {
      const token = String(req.query?.v || '');
      if (!VIEW_TOKEN_RE.test(token)) {
        res.status(400).json({ ok: false, error: 'bad view token' });
        return;
      }
      const raw = await upstash(['GET', `status:latest:${token}`]);
      if (!raw) {
        res.status(404).json({ ok: false, error: 'not found' });
        return;
      }
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        data = null;
      }
      res.status(200).json({ ok: true, data });
      return;
    }

    res.status(405).json({ ok: false, error: 'method not allowed' });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}

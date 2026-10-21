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

import { createHash } from 'node:crypto';
import { isEtagMatch } from '../src/lib/statusEtag.js';

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 日
/** 受け付ける送信の上限(バイト)。ふだんは約130KB。Upstash の1件あたりの上限(1MB)より手前で止める。 */
export const MAX_INGEST_BYTES = 900_000;
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

/**
 * 受け口の記録(2026-10-15): 「拡張の送信が届いているか・どう返したか」を、サーバー側の1行で分かるようにする。
 *   ★鍵・閲覧トークン・本文は書かない。結果と大きさと送信元の種類だけ。
 *   (記録が無い間は、拡張が送っていないのか断られたのかを、拡張の画面を見ずに区別できなかった)
 */
export function logIngest(req, outcome) {
  try {
    const origin = String(req.headers?.origin || '');
    console.log(JSON.stringify({
      m: 'status-ingest',
      outcome,
      bytes: Number(req.headers?.['content-length']) || 0,
      from: origin.startsWith('chrome-extension://') ? 'extension' : origin ? 'web' : 'none'
    }));
  } catch {
    /* 記録の失敗で受け口を止めない */
  }
}

/** 保存文字列から ETag(引用符つき)を作る。同じ文字列なら必ず同じ値。 */
export function etagOf(stored) {
  return `"${createHash('sha1').update(String(stored)).digest('base64url')}"`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'POST') {
      const ingestKey = process.env.STATUS_INGEST_KEY;
      const sent = req.headers['x-share-key'];
      if (!ingestKey || sent !== ingestKey) {
        logIngest(req, 'unauthorized');
        res.status(401).json({ ok: false, error: 'unauthorized' });
        return;
      }
      // ★v0.1.1729: 大きすぎる送信は保存しない(Upstash の1件あたりの上限・無料枠を守る)。理由は記録に残す。
      if (Number(req.headers?.['content-length']) > MAX_INGEST_BYTES) {
        logIngest(req, 'too_large');
        res.status(413).json({ ok: false, error: 'too large' });
        return;
      }
      const body = readBody(req);
      if (!body || typeof body !== 'object') {
        logIngest(req, 'bad_body');
        res.status(400).json({ ok: false, error: 'bad body' });
        return;
      }
      const token = String(body.v || req.headers['x-view-token'] || '');
      if (!VIEW_TOKEN_RE.test(token)) {
        logIngest(req, 'bad_token');
        res.status(400).json({ ok: false, error: 'bad view token' });
        return;
      }
      // v はストレージに含めない(ペイロードのみ保存)。
      const payload = { ...body };
      delete payload.v;
      const stored = JSON.stringify(payload);
      await upstash(['SET', `status:latest:${token}`, stored, 'EX', String(TTL_SECONDS)]);
      // ★v0.1.1729: 中身のハッシュを別キーに置く=GET が本体を読まずに「変わっていない(304)」を返せる。
      //   失敗しても本体の保存は済んでいる=GET は ETag 無しの 200 に倒れるだけ(取りこぼさない)。
      try {
        await upstash(['SET', `status:etag:${token}`, etagOf(stored), 'EX', String(TTL_SECONDS)]);
      } catch {
        /* ETag は最適化。失敗で受け口を止めない */
      }
      logIngest(req, 'ok');
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'GET') {
      const token = String(req.query?.v || '');
      if (!VIEW_TOKEN_RE.test(token)) {
        res.status(400).json({ ok: false, error: 'bad view token' });
        return;
      }
      // ★v0.1.1729: スマホが持っている版と同じなら本文なしの 304(本体は読まない=Redis も通信も軽い)。
      const ifNoneMatch = req.headers?.['if-none-match'];
      if (ifNoneMatch) {
        let savedEtag = null;
        try {
          savedEtag = await upstash(['GET', `status:etag:${token}`]);
        } catch {
          savedEtag = null; // 照合できなければ本文を返す側に倒す
        }
        if (isEtagMatch(ifNoneMatch, savedEtag)) {
          res.setHeader('ETag', savedEtag);
          res.status(304).end();
          return;
        }
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
      // ETag は「保存された文字列」から作る=POST 時に別キーへ置いた値と同じになる。
      res.setHeader('ETag', etagOf(raw));
      res.status(200).json({ ok: true, data });
      return;
    }

    res.status(405).json({ ok: false, error: 'method not allowed' });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}

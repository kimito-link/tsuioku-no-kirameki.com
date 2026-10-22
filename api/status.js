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
 *   - TTL 24 時間(放置データの自然消滅・v0.1.1730 で 7 日から短縮)。
 *   - ★v0.1.1730: 利用者ごとの鍵(x-device-id + x-write-key・api/device.js で発行)でも書ける。
 *     書き込み先の閲覧トークンは【サーバーが鍵の記録から決める】=他人のトークンを指定して上書きできない。
 *     利用者ごとの1日の上限・全体の上限を超えたら 429(Retry-After 120)。
 *
 *   ※ 概要だけスコープ。コメント全文は将来。
 */

import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { GZIP_BODY_HEADER } from '../src/lib/gzipBody.js';
import { isEtagMatch } from '../src/lib/statusEtag.js';
import {
  DEVICE_TTL_SECONDS,
  QUOTA_RETRY_AFTER_SEC,
  STATUS_TTL_SECONDS,
  VIEWER_ACTIVE_TTL_SEC,
  deviceKeys,
  quotaVerdict,
  stripDeviceBody
} from '../src/lib/deviceAuth.js';
import { authenticateDevice, incrWithExpiry, upstash } from '../src/server/deviceStore.js';

/** ★v0.1.1730: 保存期間 7日→24時間(2026-10-21 りんく了承)。共有キー経路も利用者経路も同じ。 */
const TTL_SECONDS = STATUS_TTL_SECONDS;
/** 受け付ける送信の上限(バイト)。ふだんは約130KB。Upstash の1件あたりの上限(1MB)より手前で止める。 */
export const MAX_INGEST_BYTES = 900_000;
const VIEW_TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;

export function readBody(req) {
  // ★v0.1.1735: gzip の本文(Content-Type: application/octet-stream → Vercel は Buffer で渡す)。
  //   Content-Encoding は使わない(途中で解かれると二重に解くことになる)=専用ヘッダで伝える。
  //   解いた後の大きさも MAX_INGEST_BYTES で止める(小さな圧縮で巨大に膨らむ本文を受けない)。壊れていたら null=400。
  if (String(req.headers?.[GZIP_BODY_HEADER] || '') === 'gzip') {
    const raw = req.body;
    if (!(raw instanceof Uint8Array)) return null;
    try {
      return JSON.parse(gunzipSync(raw, { maxOutputLength: MAX_INGEST_BYTES }).toString('utf8'));
    } catch {
      return null;
    }
  }
  // Vercel Node Functions は req.body を自動 parse することがあるが、
  // 念のため両対応(既に object ならそのまま)。
  if (req.body instanceof Uint8Array) return null;
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

/**
 * v0.1.1736: いまスマホがこのトークンを開いているか(GET が30秒以内に来たか)。拡張は true の間だけ約5秒間隔で送る。
 *   読めなければ false(=ふだんの間隔に倒す・送りすぎない)。
 */
async function isViewerActive(token) {
  try {
    return Boolean(await upstash(['GET', deviceKeys.viewing(token)]));
  } catch {
    return false;
  }
}

/** 本体と ETag(別キー)を保存する。 */
async function saveSnapshot(token, stored) {
  await upstash(['SET', deviceKeys.latest(token), stored, 'EX', String(TTL_SECONDS)]);
  // ★v0.1.1729: 中身のハッシュを別キーに置く=GET が本体を読まずに「変わっていない(304)」を返せる。
  //   失敗しても本体の保存は済んでいる=GET は ETag 無しの 200 に倒れるだけ(取りこぼさない)。
  try {
    await upstash(['SET', deviceKeys.etag(token), etagOf(stored), 'EX', String(TTL_SECONDS)]);
  } catch {
    /* ETag は最適化。失敗で受け口を止めない */
  }
}

/**
 * ★v0.1.1730: 利用者ごとの鍵での書き込み。
 *   照合 → 大きさ → 上限(利用者ごと・全体) → 診断の全文を落として保存 → 鍵の記録の期限を延ばす。
 */
async function handleDevicePost(req, res) {
  const auth = await authenticateDevice(req.headers);
  if (!auth) {
    logIngest(req, 'device_unauthorized');
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
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
  const nowMs = Date.now();
  const deviceCount = await incrWithExpiry(deviceKeys.deviceQuota(auth.deviceId, nowMs), 2 * 24 * 60 * 60);
  const globalCount = await incrWithExpiry(deviceKeys.globalQuota(nowMs), 2 * 24 * 60 * 60);
  const verdict = quotaVerdict({
    deviceCount,
    deviceLimit: Number(process.env.DEVICE_DAILY_LIMIT) || undefined,
    globalCount,
    globalLimit: Number(process.env.STATUS_GLOBAL_DAILY_LIMIT) || undefined
  });
  if (verdict.globalWarn) logIngest(req, 'global_quota_warn');
  if (!verdict.allow) {
    logIngest(req, verdict.reason);
    res.setHeader('Retry-After', String(QUOTA_RETRY_AFTER_SEC));
    res.status(429).json({ ok: false, error: verdict.reason, retryAfterSec: QUOTA_RETRY_AFTER_SEC });
    return;
  }
  // 書き込み先はサーバーが決める(body.v / x-view-token は見ない)。
  await saveSnapshot(auth.record.v, JSON.stringify(stripDeviceBody(body)));
  try {
    await upstash(['EXPIRE', deviceKeys.device(auth.deviceId), String(DEVICE_TTL_SECONDS)]);
  } catch {
    /* 期限の延長は最適化 */
  }
  logIngest(req, 'device_ok');
  res.status(200).json({ ok: true, viewerActive: await isViewerActive(auth.record.v), gzipOk: true });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'POST' && req.headers?.['x-device-id']) {
      await handleDevicePost(req, res);
      return;
    }

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
      await saveSnapshot(token, JSON.stringify(payload));
      logIngest(req, 'ok');
      res.status(200).json({ ok: true, viewerActive: await isViewerActive(token), gzipOk: true });
      return;
    }

    if (req.method === 'GET') {
      const token = String(req.query?.v || '');
      if (!VIEW_TOKEN_RE.test(token)) {
        res.status(400).json({ ok: false, error: 'bad view token' });
        return;
      }
      // ★v0.1.1736: 「いまスマホで開いている」目印を置く(30秒で消える・中身は '1' だけ)。
      //   拡張はこれを見て、開いている間だけ約5秒間隔で送る(誰も見ていないときは今までどおり)。最適化なので失敗は無視。
      //   ★await する(返事を返した後の通信は、関数が止められて届かないことがある)。
      await upstash(['SET', deviceKeys.viewing(token), '1', 'EX', String(VIEWER_ACTIVE_TTL_SEC)]).catch(() => {});
      // ★v0.1.1729: スマホが持っている版と同じなら本文なしの 304(本体は読まない=Redis も通信も軽い)。
      const ifNoneMatch = req.headers?.['if-none-match'];
      if (ifNoneMatch) {
        let savedEtag = null;
        try {
          savedEtag = await upstash(['GET', deviceKeys.etag(token)]);
        } catch {
          savedEtag = null; // 照合できなければ本文を返す側に倒す
        }
        if (isEtagMatch(ifNoneMatch, savedEtag)) {
          res.setHeader('ETag', savedEtag);
          res.status(304).end();
          return;
        }
      }
      const raw = await upstash(['GET', deviceKeys.latest(token)]);
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

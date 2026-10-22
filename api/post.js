// @ts-nocheck
/**
 * スマホからのコメントの受け渡し口(v0.1.1734・スマホからコメントを届ける)。
 *
 *   スマホ(投稿用の鍵 x-post-key・URL の #pk=):
 *     POST /api/post                  1件預ける { id, text, lv }。回数制限あり。
 *     GET  /api/post?ids=a,b&active=1  預けたものの状態と、PC が最後に取りに来た時刻。
 *                                      active=1 = 入力中/送信待ち(PC が取りに行く間隔を縮める合図)。
 *   PC の拡張(利用者ごとの鍵 x-device-id + x-write-key、または共有キー x-share-key + x-view-token):
 *     POST /api/post?action=enable    投稿用の鍵を発行する(前の鍵は無効になる)。返す: { postKey }
 *     POST /api/post?action=disable   投稿用の鍵を消す(スマホからは送れなくなる)。
 *     POST /api/post?action=pull      預かっているものを取り出す。返す: { items, active }
 *     POST /api/post?action=ack       1件の結果 { id, state: 'sent' | 'failed', reason }
 *
 *   ★ニコニコのログイン情報はどこにも無い。投稿するのは PC のブラウザ(ログイン済み)のコメント欄。
 *   ★投稿用の鍵そのものは保存しない(sha256 だけ)。閲覧URL(?v=)を知っているだけでは送れない。
 *   ★本文は待ち行列に最長60秒しか置かない(PC が受け取ったら消える)。状態は本文なしで10分。
 *   判定・キー名は src/lib/phonePost.js(純関数)。
 */

import {
  PHONE_POST_ACTIVE_TTL_SEC,
  PHONE_POST_KEY_TTL_SEC,
  PHONE_POST_PULL_BATCH,
  PHONE_POST_STALE_MS,
  PHONE_POST_STATE_TTL_SEC,
  PHONE_POST_WINDOW_SEC,
  encodeFailedState,
  isPhonePostStale,
  isValidPostId,
  isValidPostKey,
  isValidViewToken,
  normalizePostLv,
  normalizePostText,
  parsePhonePostItem,
  phonePostKeys,
  phonePostRateVerdict
} from '../src/lib/phonePost.js';
import {
  authenticateDevice,
  incrWithExpiry,
  randomToken,
  revokePhonePost,
  sha256Hex,
  upstash
} from '../src/server/deviceStore.js';

/** 本文・鍵は書かない。結果だけ。 */
export function logPost(outcome) {
  try {
    console.log(JSON.stringify({ m: 'phone-post', outcome }));
  } catch {
    /* 記録の失敗で受け口を止めない */
  }
}

function readBody(req) {
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
 * PC の拡張の照合。合えばその利用者の送り先(閲覧トークン)を返す。合わなければ null。
 *   利用者ごとの鍵: 送り先はサーバーの記録から決める(他人の送り先を名乗れない)。
 *   共有キー(開発者の診断用): 送り先は x-view-token。
 */
export async function authenticateOwner(headers) {
  if (headers?.['x-device-id']) {
    const auth = await authenticateDevice(headers);
    return auth ? auth.record.v : null;
  }
  const ingestKey = process.env.STATUS_INGEST_KEY;
  const sent = headers?.['x-share-key'];
  const token = headers?.['x-view-token'];
  if (!ingestKey || sent !== ingestKey || !isValidViewToken(token)) return null;
  return token;
}

/** スマホの投稿用の鍵の照合。合えば送り先(閲覧トークン)。 */
export async function authenticatePoster(headers) {
  const pk = headers?.['x-post-key'];
  if (!isValidPostKey(pk)) return null;
  const token = await upstash(['GET', phonePostKeys.key(sha256Hex(pk))]);
  return isValidViewToken(token) ? token : null;
}

async function setState(token, id, value) {
  await upstash(['HSET', phonePostKeys.states(token), id, value]);
  await upstash(['EXPIRE', phonePostKeys.states(token), String(PHONE_POST_STATE_TTL_SEC)]);
}

async function handleOwner(req, res, action) {
  const token = await authenticateOwner(req.headers);
  if (!token) {
    logPost(`${action}_unauthorized`);
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  const nowMs = Date.now();

  if (action === 'enable') {
    const postKey = randomToken(32);
    const hash = sha256Hex(postKey);
    const prev = await upstash(['GET', phonePostKeys.owner(token)]);
    if (typeof prev === 'string' && prev) await upstash(['DEL', phonePostKeys.key(prev)]);
    await upstash(['SET', phonePostKeys.key(hash), token, 'EX', String(PHONE_POST_KEY_TTL_SEC)]);
    await upstash(['SET', phonePostKeys.owner(token), hash, 'EX', String(PHONE_POST_KEY_TTL_SEC)]);
    logPost('enabled');
    res.status(200).json({ ok: true, postKey });
    return;
  }

  if (action === 'disable') {
    await revokePhonePost(token);
    logPost('disabled');
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'pull') {
    // PC が取りに来た時刻=スマホの「PCとつながっています」の根拠。
    await upstash(['SET', phonePostKeys.pcSeen(token), String(nowMs), 'EX', '300']);
    const raw = await upstash(['LPOP', phonePostKeys.queue(token), String(PHONE_POST_PULL_BATCH)]);
    const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
    const items = [];
    for (const r of list) {
      const item = parsePhonePostItem(r);
      if (!item) continue;
      if (isPhonePostStale(item, nowMs)) {
        // 遅れて流すと場違いになる=投稿しない。スマホには「届かなかった」と返す。
        await setState(token, item.id, encodeFailedState('failed', 'stale'));
        continue;
      }
      await setState(token, item.id, 'taken');
      items.push(item);
    }
    const active = Boolean(await upstash(['EXISTS', phonePostKeys.active(token)]));
    if (items.length) logPost('pulled');
    res.status(200).json({ ok: true, items, active });
    return;
  }

  if (action === 'ack') {
    const body = readBody(req) || {};
    if (!isValidPostId(body.id) || (body.state !== 'sent' && body.state !== 'failed')) {
      res.status(400).json({ ok: false, error: 'bad body' });
      return;
    }
    await setState(token, body.id, body.state === 'sent' ? 'sent' : encodeFailedState('failed', String(body.reason || '')));
    logPost(`ack_${body.state}`);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(400).json({ ok: false, error: 'bad action' });
}

async function handlePosterPost(req, res) {
  const token = await authenticatePoster(req.headers);
  if (!token) {
    logPost('post_unauthorized');
    res.status(401).json({ ok: false, error: 'no_key' });
    return;
  }
  const body = readBody(req) || {};
  const text = normalizePostText(body.text);
  const lv = normalizePostLv(body.lv);
  if (!isValidPostId(body.id) || !text || !lv) {
    logPost('post_bad_body');
    res.status(400).json({ ok: false, error: 'bad_body' });
    return;
  }
  const nowMs = Date.now();
  const verdict = phonePostRateVerdict({
    windowCount: await incrWithExpiry(phonePostKeys.rate(token, nowMs), PHONE_POST_WINDOW_SEC * 2),
    dailyCount: await incrWithExpiry(phonePostKeys.daily(token, nowMs), 2 * 24 * 60 * 60)
  });
  if (!verdict.allow) {
    logPost(verdict.reason);
    res.setHeader('Retry-After', String(PHONE_POST_WINDOW_SEC));
    res.status(429).json({ ok: false, error: verdict.reason });
    return;
  }
  const item = JSON.stringify({ id: body.id, text, lv, at: nowMs });
  await upstash(['RPUSH', phonePostKeys.queue(token), item]);
  // 待ち行列ごと短い寿命にする(PC が来なければ本文は自然に消える)。
  await upstash(['EXPIRE', phonePostKeys.queue(token), String(Math.ceil(PHONE_POST_STALE_MS / 1000) * 2)]);
  await upstash(['SET', phonePostKeys.active(token), '1', 'EX', String(PHONE_POST_ACTIVE_TTL_SEC)]);
  await setState(token, body.id, 'queued');
  logPost('queued');
  res.status(200).json({ ok: true, at: nowMs });
}

async function handlePosterGet(req, res) {
  const token = await authenticatePoster(req.headers);
  if (!token) {
    res.status(401).json({ ok: false, error: 'no_key' });
    return;
  }
  if (String(req.query?.active || '') === '1') {
    await upstash(['SET', phonePostKeys.active(token), '1', 'EX', String(PHONE_POST_ACTIVE_TTL_SEC)]);
  }
  const ids = String(req.query?.ids || '')
    .split(',')
    .filter((id) => isValidPostId(id))
    .slice(0, 10);
  const states = {};
  if (ids.length) {
    const got = await upstash(['HMGET', phonePostKeys.states(token), ...ids]);
    ids.forEach((id, i) => {
      if (Array.isArray(got) && typeof got[i] === 'string') states[id] = got[i];
    });
  }
  const pcSeenAt = Number(await upstash(['GET', phonePostKeys.pcSeen(token)])) || 0;
  res.status(200).json({ ok: true, now: Date.now(), pcSeenAt, states });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const action = String(req.query?.action || '');
    if (req.method === 'POST' && action) {
      await handleOwner(req, res, action);
      return;
    }
    if (req.method === 'POST') {
      await handlePosterPost(req, res);
      return;
    }
    if (req.method === 'GET') {
      await handlePosterGet(req, res);
      return;
    }
    res.status(405).json({ ok: false, error: 'method not allowed' });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}

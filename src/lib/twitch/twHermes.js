// twHermes.js — twitch.tv のページ自身が使う通知の口(Hermes)の1通を読む(純関数)
// @layer L0 — 純粋計算(WebSocket は呼び出し側)
//
// ★2026-11-08 PC 実測(ログインなし・公開の Client-Id だけ):
//   - wss://hermes.twitch.tv/v1?clientId=<Client-Id> につなぎ、話題(topic)ごとに subscribe を送る。
//     {"type":"subscribe","id","subscribe":{"id","type":"pubsub","pubsub":{"topic":"community-points-channel-v1.<id>"}},"timestamp"}
//   - 届く順: welcome(keepaliveSec)→ subscribeResponse(result "ok" / error)→ keepalive → notification。
//   - notification.pubsub は「文字列の JSON」。話題名は付かないので、subscription.id で対応づける。
//   - community-points-channel-v1 の reward-redeemed に、交換したリワードの名前・人・本文が入っている。
//     IRC には本文つきの交換しか乗らず、リワードの名前も無い。
//   形が違えば null(AGENTS.md §3.6)。

/** @param {string} clientId */
export function twHermesUrl(clientId) {
  return `wss://hermes.twitch.tv/v1?clientId=${encodeURIComponent(String(clientId || ''))}`;
}

/** @param {string} channelId 数字の id */
export function twRewardTopic(channelId) {
  const id = String(channelId || '');
  return /^\d{1,20}$/.test(id) ? `community-points-channel-v1.${id}` : '';
}

/** @param {string} topic @param {string} subId @param {string} [msgId] @param {string} [nowIso] */
export function twHermesSubscribeMsg(topic, subId, msgId = subId, nowIso = new Date().toISOString()) {
  return { type: 'subscribe', id: msgId, subscribe: { id: subId, type: 'pubsub', pubsub: { topic } }, timestamp: nowIso };
}

/** @param {unknown} v */
function obj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? /** @type {Record<string, any>} */ (v) : null;
}

/**
 * Hermes の1通 → 読めた形。読めなければ null。
 * @param {unknown} raw
 * @returns {null | { type: 'welcome', keepaliveSec: number } | { type: 'keepalive' } | { type: 'subscribed', subId: string, ok: boolean, error: string }
 *   | { type: 'notification', subId: string, data: Record<string, any> | null } | { type: 'reconnect', url: string }}
 */
export function parseTwHermesFrame(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  let m;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  const o = obj(m);
  if (!o || typeof o.type !== 'string') return null;
  if (o.type === 'welcome') return { type: 'welcome', keepaliveSec: Math.max(5, Math.min(600, Number(obj(o.welcome)?.keepaliveSec) || 10)) };
  if (o.type === 'keepalive') return { type: 'keepalive' };
  if (o.type === 'reconnect') {
    const url = String(obj(o.reconnect)?.url || '');
    return { type: 'reconnect', url: /^wss:\/\/hermes\.twitch\.tv\//.test(url) ? url : '' };
  }
  if (o.type === 'subscribeResponse') {
    const r = obj(o.subscribeResponse);
    const ok = String(r?.result || '') === 'ok';
    return { type: 'subscribed', subId: String(obj(r?.subscription)?.id || ''), ok, error: ok ? '' : String(r?.errorCode || r?.error || 'error') };
  }
  if (o.type === 'notification') {
    const n = obj(o.notification);
    let data = n?.pubsub;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        data = null;
      }
    }
    return { type: 'notification', subId: String(obj(n?.subscription)?.id || ''), data: obj(data) };
  }
  return null;
}

/**
 * reward-redeemed(チャンネルポイントの交換)→ 記録の1行(twIrcParse と同じ形・kind 'tw_reward')。それ以外・形が違えば null。
 * @param {Record<string, any> | null} data notification の中身
 * @param {string} channel チャンネルの login
 */
export function parseTwRedemption(data, channel) {
  if (!data || data.type !== 'reward-redeemed') return null;
  const r = obj(obj(data.data)?.redemption);
  const user = obj(r?.user);
  const reward = obj(r?.reward);
  const id = String(r?.id || '').trim();
  const login = String(user?.login || '').toLowerCase();
  const userId = String(user?.id || '').trim();
  const title = String(reward?.title || '').trim();
  if (!id || !title || !/^[a-z0-9_]{1,25}$/.test(login)) return null;
  const input = String(r?.user_input || '').trim();
  const at = Date.parse(String(r?.redeemed_at || obj(data.data)?.timestamp || ''));
  return {
    id: `tw-redeem-${id}`,
    channelId: /^\d{1,20}$/.test(userId) ? `tw:${userId}` : `tw:@${login}`,
    name: String(user?.display_name || login),
    login,
    iconUrl: '',
    badges: /** @type {string[]} */ ([]),
    ts: '',
    postedAtMs: Number.isFinite(at) ? at : 0,
    channel: String(channel || '').toLowerCase(),
    roomId: '',
    color: '',
    text: input ? `「${title}」を交換しました: ${input}` : `「${title}」を交換しました`,
    kind: 'tw_reward',
    amount: 0,
    currency: '',
    rewardCost: Math.max(0, Math.floor(Number(reward?.cost) || 0)),
  };
}

/** ハイプトレインの話題 @param {string} channelId */
export function twHypeTopic(channelId) {
  const id = String(channelId || '');
  return /^\d{1,20}$/.test(id) ? `hype-train-events-v2.${id}` : '';
}

/** 予想(チャンネルポイントで当てる)の話題 @param {string} channelId */
export function twPredictionTopic(channelId) {
  const id = String(channelId || '');
  return /^\d{1,20}$/.test(id) ? `predictions-channel-v1.${id}` : '';
}

/**
 * 配信者の名前で残す1行(ハイプトレインのレベル・予想の結果)。
 * @param {{ channel: string, channelId: string, broadcasterName?: string }} ctx
 * @param {string} id @param {string} text @param {string} kind @param {number} [atMs]
 */
function broadcasterRow(ctx, id, text, kind, atMs = 0) {
  const login = String(ctx.channel || '').toLowerCase();
  const cid = String(ctx.channelId || '');
  return {
    id,
    channelId: /^\d{1,20}$/.test(cid) ? `tw:${cid}` : `tw:@${login}`,
    name: String(ctx.broadcasterName || login),
    login,
    iconUrl: '',
    badges: ['broadcaster'],
    ts: '',
    postedAtMs: atMs,
    channel: login,
    roomId: cid,
    color: '',
    text,
    kind,
    amount: 0,
    currency: '',
  };
}

/** @param {unknown} s */
function twSourceLabel(s) {
  const v = String(s || '').toUpperCase();
  if (v.includes('BITS')) return 'Bits';
  if (v.includes('SUB')) return 'サブスク';
  return '';
}

/**
 * ハイプトレイン(2026-11-08 PC 実測の形)→ 記録の1行。記録しない通知・形が違えば null。
 * - hype-train-level-up: 配信者の名前で「ハイプトレインがレベル N になりました」(同じレベルは1回)
 * - hype-train-conductor-update: その人の名前で「ハイプトレインの車掌になりました(Bits)」
 * - hype-train-end: 配信者の名前で「ハイプトレインが終わりました(レベル N)」
 * 進み具合(progression)は1件ごとに来るので記録しない(Bits・サブスクの行は IRC で記録済み)。
 * @param {Record<string, any> | null} data notification の中身
 * @param {{ channel: string, channelId: string, broadcasterName?: string, lastLevel?: number, nowMs?: number }} ctx
 * @returns {null | { row: ReturnType<typeof broadcasterRow>, level?: number }}
 */
export function parseTwHypeTrain(data, ctx) {
  const t = String(data?.type || '');
  const d = obj(data?.data);
  if (!d || !/^hype-train-/.test(t)) return null;
  const now = Number(ctx.nowMs) || 0;
  if (t === 'hype-train-level-up') {
    const level = Math.floor(Number(obj(obj(d.progress)?.level)?.value) || 0);
    const trainId = String(obj(d.hype_train)?.id || '').trim();
    if (!(level >= 1) || !trainId) return null;
    return { row: broadcasterRow(ctx, `tw-hype-${trainId}-lv${level}`, `ハイプトレインがレベル${level}になりました`, 'tw_hype', now), level };
  }
  if (t === 'hype-train-end') {
    const trainId = String(d.id || '').trim();
    if (!trainId) return null;
    const lv = Math.floor(Number(ctx.lastLevel) || 0);
    const atSec = Number(d.ended_at);
    const at = atSec > 1e12 ? atSec : atSec > 1e9 ? atSec * 1000 : now;
    return { row: broadcasterRow(ctx, `tw-hype-${trainId}-end`, `ハイプトレインが終わりました${lv >= 1 ? `(レベル${lv})` : ''}`, 'tw_hype', at) };
  }
  if (t === 'hype-train-conductor-update') {
    const u = obj(d.user);
    const login = String(u?.login || '').toLowerCase();
    const userId = String(u?.id || '').trim();
    if (!/^[a-z0-9_]{1,25}$/.test(login)) return null;
    const src = twSourceLabel(d.source);
    const row = broadcasterRow(ctx, `tw-hype-cond-${String(d.id || '').trim() || 'x'}-${String(d.source || '')}-${userId || login}`, `ハイプトレインの車掌になりました${src ? `(${src})` : ''}`, 'tw_hype', now);
    return {
      row: {
        ...row,
        channelId: /^\d{1,20}$/.test(userId) ? `tw:${userId}` : `tw:@${login}`,
        name: String(u?.display_name || login),
        login,
        badges: [],
      },
    };
  }
  return null;
}

/**
 * 予想の結果(event-updated で status が RESOLVED)→ 配信者の名前で1行。それ以外・形が違えば null。
 * 「予想「勝てる?」の結果: 「はい」(12人・3,400ポイント)」
 * @param {Record<string, any> | null} data
 * @param {{ channel: string, channelId: string, broadcasterName?: string, nowMs?: number }} ctx
 */
export function parseTwPrediction(data, ctx) {
  if (String(data?.type || '') !== 'event-updated') return null;
  const e = obj(obj(data?.data)?.event);
  if (!e || String(e.status || '') !== 'RESOLVED') return null;
  const id = String(e.id || '').trim();
  const title = String(e.title || '').trim();
  const outcomes = Array.isArray(e.outcomes) ? e.outcomes.map(obj).filter(Boolean) : [];
  const win = outcomes.find((o) => String(o?.id || '') === String(e.winning_outcome_id || ''));
  if (!id || !title || !win) return null;
  const users = Math.max(0, Math.floor(Number(win.total_users) || 0));
  const pts = Math.max(0, Math.floor(Number(win.total_points) || 0));
  const detail = users || pts ? `(${users.toLocaleString('ja-JP')}人・${pts.toLocaleString('ja-JP')}ポイント)` : '';
  const at = Date.parse(String(e.ended_at || ''));
  return broadcasterRow(ctx, `tw-pred-${id}`, `予想「${title}」の結果: 「${String(win.title || '').trim()}」${detail}`, 'tw_prediction', Number.isFinite(at) ? at : Number(ctx.nowMs) || 0);
}

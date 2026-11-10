// kickRealtime.js — Kick のチャットの「つなぎ先」を決めて、届いた1通を読む(純関数)
// @layer L0 — 純粋計算
//
// ★2026-11-08 PC 実測(memory kick-realtime-protocol):
//   - 拡張に固定で持たせた Pusher の鍵は全クラスタで 4001(無効)になっていた=鍵を固定しない。
//   - Kick のページは POST https://web.kick.com/api/v1/realtime/connection でつなぎ先を聞く。
//     両方受けると Centrifugo(wss://realtime.<region>.platform.kick.com/connection/websocket)、
//     Pusher だけ受けると新しい app_key / cluster が返る。
//   - Centrifugo は POST https://web.kick.com/api/v1/realtime/auth/connection で token をもらい、
//     {"connect":{"token","name":"js"},"id":1} → {"subscribe":{"channel","flag":1},"id":n} を送る。
//     届く形は {"push":{"channel","pub":{"data":{"event","data":"<JSON 文字列>"}}}}。1フレームに改行区切りで複数。
//     サーバーの {} には {} を返す(ping)。
//   形が違えば null / [](AGENTS.md §3.6)。

export const KICK_REALTIME_CONNECTION_URL = 'https://web.kick.com/api/v1/realtime/connection';
export const KICK_REALTIME_AUTH_URL = 'https://web.kick.com/api/v1/realtime/auth/connection';

/** @param {unknown} v */
function obj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? /** @type {Record<string, any>} */ (v) : null;
}

/**
 * つなぎ先を聞く本文。
 * @param {string} clientId
 * @param {Array<'centrifugo' | 'pusher'>} [providers]
 */
export function kickRealtimeConnectionBody(clientId, providers = ['pusher', 'centrifugo']) {
  return {
    client: { id: String(clientId || ''), type: 'web' },
    capabilities: { accepted_providers: providers.map((provider) => ({ provider })) },
  };
}

/** Centrifugo の URL として通すもの(Kick の realtime の wss だけ) @param {unknown} url */
export function safeKickRealtimeUrl(url) {
  const u = String(url || '').trim();
  return /^wss:\/\/[a-z0-9.-]+\.kick\.com\/[\w/.-]*$/i.test(u) ? u : '';
}

/**
 * つなぎ先の応答 → つなぎ方の一覧(返ってきた順)。読めるものが無ければ []。
 * @param {unknown} json
 * @returns {Array<{ provider: 'centrifugo', url: string } | { provider: 'pusher', key: string, cluster: string }>}
 */
export function parseKickRealtimeConnection(json) {
  const list = obj(obj(json)?.data)?.connections;
  if (!Array.isArray(list)) return [];
  /** @type {Array<any>} */
  const out = [];
  for (const c0 of list.slice(0, 5)) {
    const c = obj(c0);
    const cred = obj(c?.credentials);
    if (!c || !cred) continue;
    if (c.provider === 'centrifugo') {
      const url = safeKickRealtimeUrl(cred.url);
      if (url) out.push({ provider: 'centrifugo', url });
    } else if (c.provider === 'pusher') {
      const key = String(cred.app_key ?? cred.key ?? '').trim();
      const cluster = String(cred.cluster ?? '').trim().toLowerCase();
      if (/^[a-z0-9]{10,40}$/i.test(key) && /^[a-z0-9-]{2,12}$/.test(cluster)) out.push({ provider: 'pusher', key, cluster });
    }
  }
  return out;
}

/** token の応答 → token。無ければ '' @param {unknown} json */
export function parseKickRealtimeToken(json) {
  const d = obj(obj(json)?.data);
  const t = String(d?.token ?? obj(json)?.token ?? '').trim();
  return /^[\w.-]{10,4000}$/.test(t) ? t : '';
}

/** Pusher の URL @param {string} key @param {string} cluster */
export function kickPusherUrl(key, cluster) {
  return `wss://ws-${cluster}.pusher.com/app/${key}?protocol=7&client=js&version=8.4.0&flash=false`;
}

/** 購読するチャンネル(チャット・ギフトサブ/ポイント交換・Kicks/ランキング・配信終了) @param {string} chatroomId @param {string} [channelId] */
export function kickRealtimeChannels(chatroomId, channelId = '') {
  const out = [`chatrooms.${chatroomId}.v2`, `chatroom_${chatroomId}`];
  if (channelId) out.push(`channel.${channelId}`, `channel_${channelId}`);
  return out;
}

/** @param {string} token */
export function centrifugoConnectMsg(token) {
  return { connect: { token, name: 'js' }, id: 1 };
}

/** @param {string} channel @param {number} id */
export function centrifugoSubscribeMsg(channel, id) {
  return { subscribe: { channel, flag: 1 }, id };
}

/**
 * Centrifugo の1フレーム(改行区切りで複数あり得る)→ 読めた分の一覧。
 *   ping   = サーバーの {}(同じ {} を返す)
 *   reply  = こちらの connect / subscribe への返事(id・error)
 *   push   = イベント { event, channel, data(オブジェクト) }
 * @param {unknown} raw
 * @returns {Array<{ type: 'ping' } | { type: 'reply', id: number, ok: boolean, code: number, kind: string } | { type: 'push', event: string, channel: string, data: Record<string, any> | null }>}
 */
export function parseCentrifugoFrames(raw) {
  if (typeof raw !== 'string' || !raw) return [];
  /** @type {Array<any>} */
  const out = [];
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    let m;
    try {
      m = JSON.parse(s);
    } catch {
      continue;
    }
    const o = obj(m);
    if (!o) continue;
    if (!Object.keys(o).length) {
      out.push({ type: 'ping' });
      continue;
    }
    const push = obj(o.push);
    if (push) {
      const pub = obj(push.pub);
      const inner = obj(pub?.data);
      if (!inner || typeof inner.event !== 'string') continue;
      let data = inner.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          data = null;
        }
      }
      out.push({ type: 'push', event: inner.event, channel: String(push.channel || ''), data: obj(data) });
      continue;
    }
    if (typeof o.id === 'number') {
      const err = obj(o.error);
      out.push({
        type: 'reply',
        id: o.id,
        ok: !err,
        code: err ? Number(err.code) || 0 : 0,
        kind: o.connect ? 'connect' : o.subscribe ? 'subscribe' : err ? 'error' : 'other',
      });
    }
  }
  return out;
}

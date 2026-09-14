/**
 * nicoliveGuest.js — ニコ生の「ゲスト視聴」で必要な素の I/O だけを持つ Node 側の共有部品。
 *
 * ■ なぜ src/lib ではなく src/server か(2026-09-15)
 *   src/lib は window/document/fetch を書かない純関数の箱。ここは fetch と WebSocket を
 *   実際に叩く I/O 係なので lib に置けない。api/ と scripts/ の両方から同じものを import して
 *   使う(2 箇所目を書かない・web-ios-android/CLAUDE.md 基準⑥)。
 *
 * ■ ★秘密を出さない(このファイルの一番の制約)
 *   `webSocketUrl`(audience_token 入り)・`viewUri`・映像(HLS)の URI は
 *   戻り値として呼び出し元へ返す以外に **ログにも例外本文にも一切出さない**。ここで扱うのは
 *   「コメントサーバの場所(viewUri)を取る握手」と「watch ページ HTML を取る」だけ。
 *   映像(stream)の中身は読まない。
 *
 * ■ テスト可能性
 *   fetchViewUri は WebSocket 実装を注入できる(WebSocketImpl)。偽 WS で messageServer /
 *   disconnect / timeout を単体テストできる(DOM/chrome 非依存)。
 *
 * @module server/nicoliveGuest
 */

/** ★連絡先を名乗る(相手が迷惑に思ったとき止められるように)。呼び出し側が差し替え可能。 */
export const NICOLIVE_GUEST_UA = 'tsuioku-no-kirameki.com live-ranking (admin@kimito-link.com)';

/**
 * watch ページの HTML を取る。取れなければ ''。
 *
 * @param {string} lv `lvNNNN` 形式の番組 ID(呼び出し側で検証済みの前提)。
 * @param {{ timeoutMs?: number, signal?: AbortSignal, ua?: string }} [opts]
 *   timeoutMs: 1 リクエストの上限(既定 8000)。signal: 呼び出し側の締め切り。ua: User-Agent。
 * @returns {Promise<string>}
 */
export async function fetchWatchHtml(lv, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 8000;
  const ua = String(opts.ua || NICOLIVE_GUEST_UA);
  const signals = [opts.signal, AbortSignal.timeout(timeoutMs)].filter(Boolean);
  try {
    const res = await fetch(`https://live.nicovideo.jp/watch/${lv}`, {
      signal: AbortSignal.any(signals),
      headers: { 'user-agent': ua },
      redirect: 'follow'
    });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  }
}

/**
 * 視聴セッション WS にゲストで繋ぎ、コメントサーバの場所(view の URL)だけを受け取って切る。
 *
 * ★送るのは startWatching 1 通だけ。`ping` に pong は返さない・`keepSeat` も送らない
 *   (欲しいのは最初の messageServer だけで、席を持ち続ける必要が無い)。
 * ★`stream`(映像)の中身は読まない。
 *
 * @param {string} wsUrl 視聴セッション WS の URL(audience_token を含む=外へ出さない)。
 * @param {{ timeoutMs?: number, WebSocketImpl?: any }} [opts]
 *   timeoutMs: 握手の上限(既定 5000)。WebSocketImpl: テスト用の WS 実装(既定 globalThis.WebSocket)。
 * @returns {Promise<{ viewUri: string, error: string }>} viewUri は呼び出し元の外へ出さない。
 */
export function fetchViewUri(wsUrl, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 5000;
  // ★明示的に null/undefined を渡したら「WS 無し」と解釈する(|| で globalThis へ落とすと
  //   テストで無し環境を再現できない・本番の 501 フォールバックの経路も塞がる)。
  const WebSocketImpl = 'WebSocketImpl' in opts ? opts.WebSocketImpl : globalThis.WebSocket;
  return new Promise((resolve) => {
    let settled = false;
    /** @type {any} */
    let ws = null;
    /** @param {string} viewUri @param {string} error */
    const finish = (viewUri, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws?.close(1000); } catch { /* 閉じられないなら放置(プロセスは終わる) */ }
      resolve({ viewUri, error });
    };
    const timer = setTimeout(() => finish('', 'ws_timeout'), timeoutMs);
    if (typeof WebSocketImpl !== 'function') {
      finish('', 'ws_unavailable');
      return;
    }
    try {
      ws = new WebSocketImpl(wsUrl);
    } catch {
      finish('', 'ws_open_failed');
      return;
    }
    ws.addEventListener('open', () => {
      try {
        ws?.send(JSON.stringify({
          type: 'startWatching',
          data: {
            stream: { quality: 'abr', protocol: 'hls', latency: 'low', chasePlay: false },
            room: { protocol: 'webSocket', commentable: true },
            reconnect: false
          }
        }));
      } catch {
        finish('', 'ws_send_failed');
      }
    });
    ws.addEventListener('message', (/** @type {any} */ ev) => {
      let msg = null;
      try { msg = JSON.parse(String(ev.data || '')); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'messageServer') {
        const uri = String(msg?.data?.viewUri || '').trim();
        finish(uri && /^https:\/\//i.test(uri) ? uri : '', uri ? '' : 'no_view_uri');
      } else if (msg.type === 'disconnect') {
        finish('', 'ws_disconnect');
      }
    });
    ws.addEventListener('error', () => finish('', 'ws_error'));
    ws.addEventListener('close', () => finish('', 'ws_closed'));
  });
}

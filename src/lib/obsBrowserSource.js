/**
 * OBSのブラウザソース（https の透過ページ）へ、コメントを送ってよいかの判定。表示の色は obsOverlayStyle.js。
 *
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】スイッチの版付き記録、貼る URL、送ってよいか、期限キーを書いてよいか
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし（キー名の正本は storageKeys.js）
 * 【正本宣言】「OBSのブラウザへ送る」がオフのとき、このパソコンからコメントを出さない判断はこのファイルのみ
 *
 * 保存の版: `{ v: 1, enabled }`。v が 1 でない記録は読まない（オフに倒す）。
 * 未知の版を半分だけ適用しない。
 *
 * 拡張だけではポートを開けない。localhost の受け口（小さな補助アプリや native messaging）は
 * この版では出さない。パソコンの外に出したくないときは、透過窓のウィンドウキャプチャを使う。
 *
 * 送る間隔と大きさは、スマホへ新着を届ける係と同じ（約3秒・1回おおよそ5KB・本文の上限16KB）。
 * ここからその数字は変えない。
 */

import { encodeObsOverlayStyle, decodeObsOverlayStyle } from './obsOverlayStyle.js';

export const OBS_BROWSER_SOURCE_VERSION = 1;
/** 貼る URL のホスト。www は付けない。 */
export const OBS_APP_ORIGIN = 'https://app.tsuioku-no-kirameki.com';
/** パソコンが「いま OBS が開いているか」を確かめる間隔(ms)。オフのあいだは動かさない。 */
export const OBS_PRESENCE_POLL_MS = 10_000;
/** 透過ページが「開いている」目印を置き直す間隔(ms)。サーバーの目印は30秒で消える。 */
export const OBS_PAGE_HEARTBEAT_MS = 20_000;
/** 状態速報の送信担当が生きている印が、これより新しければこちらは送らない（二重に出さない）。 */
export const OBS_PUBLISHER_BEAT_STALE_MS = 8_000;
/** 視聴ページが小さな控えを書く期限を、この先まで延ばす(ms)。 */
export const OBS_WANTED_EXTEND_MS = 40_000;

const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * @param {unknown} raw
 * @returns {{ v: 1, enabled: boolean } | null}
 */
export function parseObsBrowserSource(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (o.v !== OBS_BROWSER_SOURCE_VERSION) return null;
  return { v: OBS_BROWSER_SOURCE_VERSION, enabled: o.enabled === true };
}

/** 読めない記録はオフ。 @param {unknown} raw */
export function obsBrowserSourceOrDefault(raw) {
  return parseObsBrowserSource(raw) || { v: OBS_BROWSER_SOURCE_VERSION, enabled: false };
}

/** @param {boolean} enabled */
export function toObsBrowserSourceRecord(enabled) {
  return { v: OBS_BROWSER_SOURCE_VERSION, enabled: enabled === true };
}

/**
 * OBS に貼る URL。トークンが推測しにくい形でなければ空。http は https にする。www は出さない。
 * @param {{ origin?: string, token?: string, style?: unknown }} a
 * @returns {string}
 */
export function buildObsBrowserSourceUrl(a) {
  const token = String(a?.token || '');
  if (!TOKEN_RE.test(token)) return '';
  let base = String(a?.origin || OBS_APP_ORIGIN).trim().replace(/\/+$/, '');
  if (base.startsWith('http://')) base = `https://${base.slice('http://'.length)}`;
  let url;
  try {
    url = new URL('/obs', base.endsWith('/obs') ? base.slice(0, -4) : base);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:') return '';
  if (url.hostname.startsWith('www.')) return '';
  url.pathname = '/obs';
  url.search = '';
  url.hash = '';
  url.searchParams.set('t', token);
  const encoded = a?.style ? encodeObsOverlayStyle(a.style) : '';
  if (encoded) url.searchParams.set('s', encoded);
  return url.toString();
}

/**
 * 透過ページのクエリ。トークンが違えば空。見た目 s が壊れていれば null（呼び出し側が既定を使う）。
 * @param {string} search
 * @returns {{ token: string, style: ReturnType<typeof decodeObsOverlayStyle> }}
 */
export function readObsBrowserSourceQuery(search) {
  let q;
  try {
    q = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  } catch {
    return { token: '', style: null };
  }
  const token = q.get('t') || '';
  if (!TOKEN_RE.test(token)) return { token: '', style: null };
  return { token, style: decodeObsOverlayStyle(q.get('s') || '') };
}

/**
 * このパソコンからコメントを出してよいか。四つ揃ったときだけ。
 * @param {{ enabled?: boolean, viewerActive?: boolean, realtime?: boolean, publisherAlive?: boolean }} a
 */
export function shouldSendObsComments(a) {
  return a?.enabled === true && a?.viewerActive === true && a?.realtime === true && a?.publisherAlive !== true;
}

/**
 * 視聴ページの期限キーをどう書くか。write が null のときは触らない（スマホ側の長い期限を消さない）。
 * @param {{ nowMs: number, enabled?: boolean, sending?: boolean, currentUntil?: number, lastWritten?: number }} a
 * @returns {{ write: number | null }}
 */
export function wantedWritePlan(a) {
  const nowMs = Number(a?.nowMs) || 0;
  const currentUntil = Number(a?.currentUntil) || 0;
  const lastWritten = Number(a?.lastWritten) || 0;
  if (a?.enabled !== true || a?.sending !== true) {
    if (lastWritten > 0 && currentUntil === lastWritten) return { write: 0 };
    return { write: null };
  }
  if (currentUntil > nowMs + 15_000) return { write: null };
  return { write: nowMs + OBS_WANTED_EXTEND_MS };
}

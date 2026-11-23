// ytLiveRowsAccept.js — 視聴ページの会場へ、保存より先に届く新着行(YT_LIVE_ROWS)を受け取ってよいか。
//   ミクチャ・SHOWROOM などは URL に配信番号が無く、会場が先に仮キー(…00000)で開くことがある。
//   そのとき本物のキーの新着を「まだこの配信を読んでいない」と捨てると、吹き出しも読み上げも全く来ない。
// @layer L0
import { streamKeysShareChannel, watchUrlMatchesStreamKey } from '../platform/streamPlatform.js';

/**
 * @param {{
 *   incomingKey?: unknown,
 *   cachedKeys?: Iterable<unknown>,
 *   pageUrl?: unknown,
 *   currentWatchKey?: unknown
 * }} [s]
 * @returns {boolean}
 */
export function shouldAcceptYtLiveRows(s = {}) {
  const incoming = String(s.incomingKey || '').trim();
  if (!incoming) return false;
  const cached = s.cachedKeys ? [...s.cachedKeys].map((k) => String(k || '')).filter(Boolean) : [];
  if (cached.includes(incoming)) return true;
  if (cached.some((k) => streamKeysShareChannel(k, incoming))) return true;
  const current = String(s.currentWatchKey || '').trim();
  if (current && (current === incoming || streamKeysShareChannel(current, incoming))) return true;
  return watchUrlMatchesStreamKey(String(s.pageUrl || ''), incoming);
}

/**
 * v0.1.1812: コメビュで NG にした人のコメントは、会場の読み上げとスマホへ送る声でも読まない。
 *   NG の正本はコメビュのリスト(nls_comeview_ng_v1)1本。画面から消した人の声だけ聞こえる食い違いをなくす。
 *   人の見分け方もコメビュと同じ comeviewUserKeyForRow(uid 優先・汎用名はキーにしない)。
 *
 * @module voiceNgMute
 */
import { COMEVIEW_NG_STORAGE_KEY, comeviewUserKeyForRow, normalizeComeviewNgList } from './comeviewActions.js';

export { COMEVIEW_NG_STORAGE_KEY };

/**
 * storage の生値から NG の人のキー集合を作る(壊れた値は空=誰も消さない)。
 * @param {unknown} raw
 * @returns {Set<string>}
 */
export function voiceNgKeySet(raw) {
  return new Set(normalizeComeviewNgList(raw).map((e) => e.key));
}

/**
 * この1件を NG の人として読まないか。
 * @param {{ userId?: unknown, nickname?: unknown, name?: unknown }|null|undefined} item
 * @param {Set<string>|null|undefined} ngKeys
 */
export function isVoiceItemNgMuted(item, ngKeys) {
  if (!item || !(ngKeys instanceof Set) || ngKeys.size === 0) return false;
  const key = comeviewUserKeyForRow({
    userId: String(item.userId ?? ''),
    name: String(item.nickname ?? item.name ?? '')
  });
  return !!key && ngKeys.has(key);
}

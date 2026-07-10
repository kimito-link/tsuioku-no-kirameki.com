/**
 * venueMirrorAvatarEnrich.js — 会場行の avatar を「①の実描画鏡(laneMirror)が解決済みの顔URL」で
 * 補強する純関数(v0.1.1118・reference_venue_pop_copy_SYNTHESIS.md §C-2 patch B)。
 *
 * 背景: ①のレーンセルはコメントenrich由来の個人サムネURL(score2)を displaySrc に持つが、
 *   会場の participant.avatar は空のことが多く、profileAvatarMap 補強(v0.1.1110)もキャッシュミスの
 *   uid は救えない。鏡には①が解決済みの URL が既に載っている(=新規 storage read ゼロの enrich 源)。
 *   これを注入すると、ロビー/トップバー/fallback でも①と【バイト一致】の顔URLになる=丸写しの字義どおり。
 *
 * 規則(嘘の上書きをしない):
 *   - 鏡から採るのは http(s) かつ 個人サムネ相当(commentEnrichmentAvatarScore===2)のみ。
 *     data:identicon は除外(匿名の identicon は描画側が①と同じ規則で再生成する)。
 *   - 行へ注入するのは「行の avatar が score<2(空/合成/弱)」のときだけ=captured 個人URLを
 *     合成URLで潰さない。同点(両方2)は行側を優先=冪等。
 *   - avatar は uid 固有(配信非依存)なので鏡の liveId 突合はしない(別配信の鏡でも顔は同一人物)。
 *
 * ★地雷(lane-limit-200の教訓): このマップは鏡 rows サイズに比例する。鏡 cap(laneMirror 側の
 *   上限)を変えるときは、このマップの件数も一緒に見ること。
 *
 * DOM/chrome 非依存=単体テスト可能。
 * @module venueMirrorAvatarEnrich
 */

import { commentEnrichmentAvatarScore } from './supportGrowthTileSrc.js';

const TIERS = ['link', 'gift', 'ad', 'konta', 'tanu'];

/**
 * 鏡スナップショットから uid → 個人サムネURL(score2のみ) のマップを作る。
 * @param {Partial<import('./laneMirror.js').LaneMirrorSnapshot>|null|undefined} snap
 * @returns {Map<string, string>}
 */
export function buildVenueMirrorAvatarMap(snap) {
  /** @type {Map<string, string>} */
  const map = new Map();
  const s = /** @type {any} */ (snap && typeof snap === 'object' ? snap : null);
  if (!s) return map;
  for (const tier of TIERS) {
    const cells = Array.isArray(s[tier]) ? s[tier] : [];
    for (const cell of cells) {
      const c = /** @type {any} */ (cell && typeof cell === 'object' ? cell : {});
      const uid = String(c.userId ?? c.entry?.userId ?? '').trim();
      if (!uid || map.has(uid)) continue;
      const url = String(c.displaySrc || '').trim();
      if (!/^https?:\/\//i.test(url)) continue; // data:identicon 等は除外
      if (commentEnrichmentAvatarScore(uid, url) !== 2) continue; // 個人サムネ相当のみ
      map.set(uid, url);
    }
  }
  return map;
}

/**
 * 会場行の avatar を鏡マップで補強する(冪等・未知フィールド保持・score比較で強い方のみ)。
 * enrichVenueRowsWithProfileAvatars の【後段】に適用する想定(profileキャッシュ→鏡の順)。
 * @param {ReadonlyArray<Record<string, any>>} rows
 * @param {Map<string, string>|null|undefined} mirrorAvatarMap buildVenueMirrorAvatarMap の戻り
 * @returns {Array<Record<string, any>>}
 */
export function enrichVenueRowsWithMirrorAvatars(rows, mirrorAvatarMap) {
  const list = Array.isArray(rows) ? rows : [];
  const map = mirrorAvatarMap instanceof Map ? mirrorAvatarMap : null;
  if (!map || map.size === 0) return list.slice();
  return list.map((r) => {
    if (!r || typeof r !== 'object') return r;
    const uid = String(r.userId || '').trim();
    if (!uid) return r;
    const mirrorUrl = map.get(uid);
    if (!mirrorUrl) return r;
    const rowScore = commentEnrichmentAvatarScore(uid, r.avatar);
    if (rowScore >= 2) return r; // 行が既に個人サムネ=上書きしない(冪等)
    return { ...r, avatar: mirrorUrl, avatarObserved: true };
  });
}

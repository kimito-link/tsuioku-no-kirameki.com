/**
 * venueResidents.js
 *
 * 会場モードの常駐3キャラ(りんく・こん太・たぬ姉)の描画モデル(純関数)。
 *
 * ユーザー(配信者)のアイデア(2026-06-15): 「会場を開いた瞬間、まず りんく・こん太・たぬ姉 を
 *   座らせ、そこからコメントを出せば確実」。3キャラを会場に常駐させれば、集計が一瞬0件でも
 *   会場が完全に無人/ローディングに見えない最後の砦になる(前状態保持 resolveDisplayRows との両輪)。
 *
 * 設計:
 *   - 3キャラは「実在の視聴者」ではない → 会場参加者カウント(「会場参加者 N人」)には含めない。
 *   - seating パイプライン(buildVenueSeating/rankVenueParticipants)には混ぜず、専用の固定DOM
 *     レイヤーとして最前列中央に常駐(venueBar 側)。本ファイルは「誰を・どの画像で出すか」だけ。
 *   - chrome 非依存: 画像URL解決は resolveUrl(=chrome.runtime.getURL)を注入してテスト可能に。
 */

import { RINKU_IMGS, KONTA_IMGS, TANUNEE_IMGS } from './celebrationCharaAssets.js';

/** 常駐キャラの ID と順序(rinku→konta→tanunee 固定)。 */
export const VENUE_RESIDENT_IDS = Object.freeze(['rinku', 'konta', 'tanunee']);

/** @type {ReadonlyArray<{ id: string, name: string, rel: string }>} */
const RESIDENT_DEFS = Object.freeze([
  Object.freeze({ id: 'rinku', name: 'りんく', rel: RINKU_IMGS.default }),
  Object.freeze({ id: 'konta', name: 'こん太', rel: KONTA_IMGS.default }),
  Object.freeze({ id: 'tanunee', name: 'たぬ姉', rel: TANUNEE_IMGS.default })
]);

/**
 * 会場常駐3キャラの描画モデルを返す。会場参加者カウントには含めない。
 *
 * @param {((rel: string) => string)} [resolveUrl] 相対パス→拡張URL(chrome.runtime.getURL)。省略時は相対パスのまま。
 * @returns {Array<{ id: string, name: string, imgSrc: string }>} 常に3体・順序固定。
 */
export function buildVenueResidents(resolveUrl) {
  const resolve =
    typeof resolveUrl === 'function'
      ? resolveUrl
      : /** @param {string} rel */ (rel) => rel;
  return RESIDENT_DEFS.map((def) => ({
    id: def.id,
    name: def.name,
    imgSrc: resolve(def.rel)
  }));
}

/**
 * 公式貢献度ランキングの取得経路（Koken API / DOM bundle / iframe storage）から
 * 最終 rows を優先度順で選び出す純関数群。
 *
 * 設計意図（v0.1.286, [[reference-koken-contribution-ranking-api]] 後段＝
 *   「Antigravity §6.1 を 3 年後楽の構造ガード」として固定）:
 *
 *   ・popup-entry.js の `resolveOfficialContributionRankingRows()` は I/O
 *     （chrome.storage.local.get + モジュール変数読み）に専念し、
 *     優先度判定とデータ検証を本ファイルの純関数群に委譲する。
 *
 *   ・これにより:
 *     1) 優先度の挙動を unit test で固定できる。3 年後に誰かが Koken→DOM の
 *        順序を戻そうとしても test 落ちで即検出（v0.1.285 §6.1 の意図保護）。
 *     2) 新しい経路（NDGR 自前集計フォールバック等）を足す時、`pickXxxRows()`
 *        を 1 つ追加して `resolveContributionRankingRowsFromSources()` の
 *        優先度テーブルに加えるだけ＝拡張点が明確（中央集中）。
 *     3) storage キー文字列（`nls_iframe_official_dom_<lid>`）をリテラル散在から
 *        本中央関数に集約＝key 命名変更時に 1 箇所 fix で済む。
 *     4) ContributionRankerRow 型は src/lib/kokenContributionRankingApi.js の
 *        `@typedef {{ rank, name, contribution, isAnonymous, thumbnailUrl }}`
 *        がプロジェクトの正本。本ファイルはその型を **「行配列」として透過に
 *        渡す**（rows shape の検証は最小限＝Array.isArray + length>0）。
 *
 *   ・「描画連鎖（refreshAll…）に await I/O 厳禁」（[[feedback-north-star-priority-no-drift]]
 *     続5）を厳守するため、本ファイルは I/O を一切持たない＝純関数のみ。
 *
 * @see resolveContributionRankingRowsFromSources - 3 経路統合のトップ関数
 * @see iframeOfficialDomStorageKey - iframe relay storage key の正本
 */

/**
 * iframe relay 保存先（audition/koken iframe の DOM bundle スナップ）の storage key。
 * content-entry.js の書き込みと popup-entry.js の読みで共有する正本。
 *
 * 命名規約: `nls_iframe_official_dom_<lowercased-liveId>`。
 * lowercase 正規化は呼び出し側で必須（content 書き込み側も同じ規約に揃える）。
 *
 * @param {string} liveId - 例: 'lv350553787'
 * @returns {string} storage key
 */
export function iframeOfficialDomStorageKey(liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  return `nls_iframe_official_dom_${lid}`;
}

/**
 * Koken API storage 値（`nls_koken_api_contrib_<lid>` の中身）から rows を抽出。
 *
 * 検証ガード（v0.1.283 tail fallback から踏襲＝不変）:
 *   - data が object か
 *   - data.liveId が引数 liveId と一致するか（古い liveId の rows 漏れ防止）
 *   - rows が非空配列か
 *
 * いずれかが破れたら null を返す＝呼び出し側は次の経路へフォールバック。
 *
 * @param {unknown} data - chrome.storage.local.get で得た生 value
 * @param {string} liveId
 * @returns {any[]|null} 検証 OK のときだけ rows、それ以外は null
 */
export function pickKokenStorageRows(data, liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return null;
  if (!data || typeof data !== 'object') return null;
  const d = /** @type {any} */ (data);
  if (String(d.liveId || '').trim().toLowerCase() !== lid) return null;
  if (!Array.isArray(d.rows) || d.rows.length === 0) return null;
  return d.rows;
}

/**
 * DOM bundle（content script が親 frame で周期スクレイプし集約したもの）から
 * `contributionRanking` 配列を抽出。
 *
 * @param {unknown} bundle - popup-entry.js の `_lastOfficialEventDomBundle` に相当
 * @returns {any[]|null}
 */
export function pickDomBundleRows(bundle) {
  if (!bundle || typeof bundle !== 'object') return null;
  const b = /** @type {any} */ (bundle);
  const rows = b.contributionRanking;
  return Array.isArray(rows) && rows.length > 0 ? rows : null;
}

/**
 * iframe relay storage（`nls_iframe_official_dom_<lid>`）から `contributionRanking`
 * 配列を抽出。audition/koken iframe の content script が relay handler で書く。
 *
 * @param {unknown} iframeData - chrome.storage.local.get で得た生 value
 * @returns {any[]|null}
 */
export function pickIframeStorageRows(iframeData) {
  if (!iframeData || typeof iframeData !== 'object') return null;
  const d = /** @type {any} */ (iframeData);
  const rows = d.contributionRanking;
  return Array.isArray(rows) && rows.length > 0 ? rows : null;
}

/**
 * 3 経路の生データから優先度順で rows を選ぶ最上位純関数。
 *
 * 優先度（v0.1.285〜, Antigravity §6.1）:
 *   1. Koken API（無認証・SW host_permissions 経由＝最も安定）
 *   2. DOM bundle（CSS Modules hash 変動リスクあり、relay 由来 fallback）
 *   3. iframe storage（初動の最終フォールバック）
 *
 * @param {{
 *   kokenStorage?: unknown,
 *   domBundle?: unknown,
 *   iframeStorage?: unknown,
 *   liveId: string
 * }} sources
 * @returns {any[]|null}
 */
export function resolveContributionRankingRowsFromSources(sources) {
  const liveId = sources && typeof sources === 'object' ? String(sources.liveId || '') : '';
  const kokenRows = pickKokenStorageRows(sources?.kokenStorage, liveId);
  if (kokenRows) return kokenRows;
  const domRows = pickDomBundleRows(sources?.domBundle);
  if (domRows) return domRows;
  const iframeRows = pickIframeStorageRows(sources?.iframeStorage);
  if (iframeRows) return iframeRows;
  return null;
}

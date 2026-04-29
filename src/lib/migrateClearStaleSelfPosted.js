/**
 * D-4: 0.1.7 / 0.1.8 / 0.1.9 で焼き込まれた古い `selfPosted: true` を剥がす
 * 後方互換 migration（chrome.runtime.onInstalled.previousVersion 起動）。
 *
 * レイヤ: lib/ (pure)
 *
 * 経緯:
 *   0.1.10 で `content-entry.js` の `pendingItems` フィルタを
 *   `filterValidSelfPostedRecents` に統一して 24h TTL を強制した（Storage H8）。
 *   これは forward-only の修正で、それ以前のバージョンで「24h 超過の自コメ recent
 *   と他人の同テキスト後発コメントが誤マッチ」したまま `nls_comments_*` に焼き込まれた
 *   `selfPosted: true` 行は新コードでは触らない。結果として：
 *     - 本人ではない他人のコメントが永久に「自コメ」扱い
 *     - りんく段（自コメは link 段に上がる設計）に他人が混ざる
 *     - 上部ランキングや HTML レポートの自コメ件数が膨らむ
 *
 * このモジュールは:
 *   1. previousVersion を見て < 0.1.10 のときだけ migration を発火（done フラグで再実行防止）
 *   2. 既存 `nls_comments_*` の各行から `selfPosted` フィールドを物理削除
 *   3. 真に自コメだった行は、次の persist サイクルで
 *      `consumeMatchedSelfPostedRecents` が `KEY_SELF_POSTED_RECENTS` の
 *      pending と再マッチして `selfPosted: true` を再付与する（TTL 内なら）
 *
 * 設計方針:
 *   - 純関数のみ（chrome.storage / IDB / DOM に触らない）
 *   - background.js 側が chrome.storage.local 操作を担う
 */

/** 0.1.10 で TTL ガードが入った baseline。これ未満からの自動更新で 1 度だけ走る */
export const STALE_SELFPOSTED_MIGRATION_BASELINE_VERSION = '0.1.10';

/** 一度走ったことを記録する chrome.storage.local キー */
export const STALE_SELFPOSTED_MIGRATION_DONE_KEY =
  'nls_migration_clear_stale_selfposted_done_v1';

/**
 * `'0.1.7'` のような semver 風文字列を `[major, minor, patch]` の数値配列に正規化。
 * 不正な値は null を返す（呼び出し側が安全に skip 判定できるように）。
 *
 * @param {unknown} raw
 * @returns {[number, number, number]|null}
 */
function parseVersionTriple(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
    return null;
  }
  return [major, minor, patch];
}

/**
 * `a < b` を semver 比較（major → minor → patch 順）で判定。
 *
 * @param {[number, number, number]} a
 * @param {[number, number, number]} b
 * @returns {boolean}
 */
function isVersionLessThan(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] < b[i]) return true;
    if (a[i] > b[i]) return false;
  }
  return false;
}

/**
 * stale `selfPosted` migration を実行すべきか判定する。
 *
 *   ・previousVersion 不明（fresh install / 解析不能）→ skip
 *   ・done フラグが既に立っている → skip
 *   ・previousVersion >= 0.1.10 → skip（既に TTL ガード版で動作）
 *   ・previousVersion <  0.1.10 → run
 *
 * @param {unknown} previousVersion `chrome.runtime.onInstalled.details.previousVersion`
 * @param {boolean} doneFlag chrome.storage.local の done flag 値（true ならスキップ）
 * @returns {boolean}
 */
export function shouldRunStaleSelfPostedMigration(previousVersion, doneFlag) {
  if (doneFlag === true) return false;
  const prev = parseVersionTriple(previousVersion);
  if (!prev) return false;
  const baseline = parseVersionTriple(STALE_SELFPOSTED_MIGRATION_BASELINE_VERSION);
  if (!baseline) return false;
  return isVersionLessThan(prev, baseline);
}

/**
 * `nls_comments_*` の 1 ライブ分のコメント配列から、すべての `selfPosted`
 * フィールド（true/false 問わず）を物理削除する。配列・各行はイミュータブルに扱い、
 * 元データを mutate しない。
 *
 * 真に自コメだった行は、次の persist サイクルで
 * `consumeMatchedSelfPostedRecents` が `KEY_SELF_POSTED_RECENTS` の pending と
 * 再マッチして `selfPosted: true` を再付与する。
 *
 * @param {unknown} commentRows
 * @returns {{ next: any[], strippedCount: number }}
 *   `strippedCount` は **`selfPosted: true` だった行の数**（false は除外）
 */
export function stripStaleSelfPostedFlags(commentRows) {
  if (!Array.isArray(commentRows)) return { next: [], strippedCount: 0 };
  let strippedCount = 0;
  const next = commentRows.map((row) => {
    if (row == null || typeof row !== 'object') return row;
    if (!('selfPosted' in row)) return row;
    if (row.selfPosted === true) strippedCount += 1;
    // selfPosted フィールドだけ落とした新オブジェクトを返す
    const cleaned = /** @type {Record<string, unknown>} */ ({ ...row });
    delete cleaned.selfPosted;
    return cleaned;
  });
  return { next, strippedCount };
}

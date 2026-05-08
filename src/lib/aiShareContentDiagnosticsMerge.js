/**
 * content 診断: 高速キャッシュ（persist）とライブ（NLS_AI_SHARE_PAGE_DIAGNOSTICS）のマージ。
 * 純粋関数のみ。
 */

/** fast ストレージ包 wrapper と persist の世代（popup が欠落検知に利用） */
export const AI_SHARE_FAST_DIAG_SCHEMA_VERSION = 2;

/** フル診断のみに存在する主要キー（fast には無い → ライブ取得で補完） */
export const LIVE_EXTENDED_DIAG_KEYS = Object.freeze([
  'gates',
  'commentUi',
  'observersAndTimers'
]);

/**
 * @param {unknown} fast
 * @param {unknown} schemaVersion
 * @returns {boolean}
 */
export function fastContentNeedsLiveMerge(fast, schemaVersion) {
  if (!fast || typeof fast !== 'object' || Array.isArray(fast)) return true;
  const sv = Number(schemaVersion);
  if (!Number.isFinite(sv) || sv < AI_SHARE_FAST_DIAG_SCHEMA_VERSION) {
    return true;
  }
  if (!('giftDiagnostics' in /** @type {Record<string, unknown>} */ (fast))) {
    return true;
  }
  return false;
}

/**
 * fast をベースに、live で未定義・null のキーだけ補完。フル専用セクションは live を優先。
 *
 * @param {Record<string, unknown>|null|undefined} fast
 * @param {Record<string, unknown>|null|undefined} live
 * @returns {{ merged: Record<string, unknown>|null, source: 'none'|'fast_only'|'live_only'|'fast+live' }}
 */
export function shallowMergeContentDiagnostics(fast, live) {
  const f =
    fast && typeof fast === 'object' && !Array.isArray(fast)
      ? /** @type {Record<string, unknown>} */ (fast)
      : null;
  const l =
    live && typeof live === 'object' && !Array.isArray(live)
      ? /** @type {Record<string, unknown>} */ (live)
      : null;
  if (!f && !l) return { merged: null, source: 'none' };
  if (!f && l) return { merged: { ...l }, source: 'live_only' };
  if (f && !l) return { merged: { ...f }, source: 'fast_only' };

  /** @type {Record<string, unknown>} */
  const merged = { ...f };
  for (const k of Object.keys(/** @type {Record<string, unknown>} */ (l))) {
    const v = l[k];
    if (merged[k] === undefined || merged[k] === null) {
      merged[k] = v;
    }
  }
  for (const k of LIVE_EXTENDED_DIAG_KEYS) {
    if (l[k] !== undefined && l[k] !== null) {
      merged[k] = l[k];
    }
  }
  if (
    (!f.giftDiagnostics || f.giftDiagnostics === null) &&
    l.giftDiagnostics != null
  ) {
    merged.giftDiagnostics = l.giftDiagnostics;
  }

  return { merged, source: 'fast+live' };
}

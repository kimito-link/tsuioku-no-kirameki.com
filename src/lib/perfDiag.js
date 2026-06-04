/**
 * 複数タブ paint 負荷の診断スナップショット。
 *
 * 白フラッシュ(複数タブ+大量コメントで paint が遅延し白く露出)の原因を
 * 実データで切り分けるため、popup が paint 区間の所要 ms やタブ数を
 * `nls_perf_diag_<lv>` に間引いて書き、status / Web版が読んで並べる。
 *
 * panel_summary(コメント記録の正本)は汚さず、別キーに分離する。
 *
 * @module perfDiag
 */

/** perfDiag の storage キー接頭辞。 */
export const PERF_DIAG_PREFIX = 'nls_perf_diag_';

/**
 * @param {string} liveId
 * @returns {string}
 */
export function perfDiagStorageKey(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `${PERF_DIAG_PREFIX}${id}`;
}

/**
 * @param {unknown} v
 * @returns {number|null}
 */
function numOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * 診断スナップショットを組み立てる(純関数)。
 * @param {{
 *   liveId?: string,
 *   tabCount?: number|null,
 *   lastPaintAt?: number|null,
 *   lastPaintMs?: number|null,
 *   commentCount?: number|null,
 *   deferActive?: boolean,
 *   paintCount?: number|null,
 *   tabVisible?: boolean|null
 * }} [opts]
 * @returns {{
 *   liveId: string,
 *   tabCount: number|null,
 *   lastPaintAt: number|null,
 *   lastPaintMs: number|null,
 *   commentCount: number|null,
 *   deferActive: boolean,
 *   paintCount: number|null,
 *   tabVisible: boolean|null
 * }}
 */
export function buildPerfDiag(opts = {}) {
  return {
    liveId: String(opts.liveId || '').trim().toLowerCase(),
    tabCount: numOrNull(opts.tabCount),
    lastPaintAt: numOrNull(opts.lastPaintAt),
    lastPaintMs: numOrNull(opts.lastPaintMs),
    commentCount: numOrNull(opts.commentCount),
    deferActive: opts.deferActive === true,
    // 累計 paint 回数(2つ目以降のタブで paint が走っていないと小さいまま)。
    paintCount: numOrNull(opts.paintCount),
    // この paint 時にタブが可視だったか(null=不明)。
    tabVisible: opts.tabVisible == null ? null : opts.tabVisible === true
  };
}

/**
 * @param {unknown} obj
 * @returns {boolean}
 */
export function isPerfDiag(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const o = /** @type {Record<string, unknown>} */ (obj);
  return typeof o.liveId === 'string';
}

/**
 * 診断 1 行のテキストを組み立てる(status / Web版で表示)。perfDiag が無ければ ''。
 * @param {ReturnType<typeof buildPerfDiag>|null|undefined} diag
 * @param {number} [nowMs]
 * @returns {string}
 */
export function buildPerfDiagLine(diag, nowMs = Date.now()) {
  if (!isPerfDiag(diag)) return '';
  const parts = [];
  if (diag.lastPaintMs != null) parts.push(`paint ${diag.lastPaintMs}ms`);
  if (diag.paintCount != null) parts.push(`描画${diag.paintCount}回`);
  if (diag.tabVisible === false) parts.push('裏タブ');
  if (diag.tabCount != null) parts.push(`タブ ${diag.tabCount}`);
  if (diag.commentCount != null) {
    parts.push(`コメント ${diag.commentCount.toLocaleString('ja-JP')}`);
  }
  if (diag.deferActive) parts.push('描画見送り中');
  if (diag.lastPaintAt != null && Number.isFinite(nowMs)) {
    const agoMs = Math.max(0, nowMs - diag.lastPaintAt);
    const ago =
      agoMs < 60_000
        ? `${Math.round(agoMs / 1000)}秒`
        : `${Math.round(agoMs / 60_000)}分`;
    parts.push(`${ago}前`);
  }
  if (!parts.length) return '';
  return `  ⚙ ${parts.join(' / ')}`;
}

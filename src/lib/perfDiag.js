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
// v0.1.1248: 描画回数に【正常域の判定】を付ける。数字だけ印字しても人もAIも読み飛ばす
//   (2026-08-04 に描画2517回が印字されていたのに誰も気づかなかった)。
import { judgePaintPerComment } from './anomalyVerdict.js';
import { formatRepaintReasonLine } from './repaintReasonCensus.js';

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
 *   tabVisible?: boolean|null,
 *   recordRate?: number|null,
 *   panelPainted?: boolean|null,
 *   shadeActive?: boolean|null,
 *   repaintReasons?: Record<string, number>|null
 * }} [opts]
 * @returns {{
 *   liveId: string,
 *   tabCount: number|null,
 *   lastPaintAt: number|null,
 *   lastPaintMs: number|null,
 *   commentCount: number|null,
 *   deferActive: boolean,
 *   paintCount: number|null,
 *   tabVisible: boolean|null,
 *   recordRate: number|null,
 *   panelPainted: boolean|null,
 *   shadeActive: boolean|null,
 *   repaintReasons: Record<string, number>|null
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
    tabVisible: opts.tabVisible == null ? null : opts.tabVisible === true,
    // v0.1.640: 取得スピード(records/sec)。退行(取得停止)の自動検出用。
    recordRate: numOrNull(opts.recordRate),
    // v0.1.854: パネルに実コンテンツが描画済か(userRoomList に子がある等)。false=白(未描画)。
    //   「スクロールで白・放置で固着」を DOM/F12 を見ずに status だけで切り分ける(null=不明)。
    panelPainted: opts.panelPainted == null ? null : opts.panelPainted === true,
    // v0.1.854: ローディング幕が今も出ているか。データが来た後も true=ローディング固着(null=不明)。
    shadeActive: opts.shadeActive == null ? null : opts.shadeActive === true,
    // v0.1.1248: 描き直しの【理由別内訳】。総数(paintCount)だけでは36ある引き金の
    //   どれが暴走しているか分からず、2026-08-04 に原因特定へ時間を要した。
    repaintReasons:
      opts.repaintReasons && typeof opts.repaintReasons === 'object'
        ? opts.repaintReasons
        : null
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
  // v0.1.640: 取得スピード(records/sec)。0 付近なら取得が止まっている合図。
  if (diag.recordRate != null) {
    parts.push(`取得 ${diag.recordRate >= 10 ? Math.round(diag.recordRate) : diag.recordRate.toFixed(1)}件/秒`);
  }
  if (diag.paintCount != null) {
    parts.push(`描画${diag.paintCount}回`);
    // v0.1.1248: 「多いか少ないか」を必ず添える。判定が無いと読み飛ばされる。
    const verdict = judgePaintPerComment(
      diag.paintCount,
      diag.commentCount,
      // ★内訳を渡すと「1コメントあたり」と言ってよいかを判定できる。
      //   2026-08-23 実データ: 描き直しの97%はコメント以外が理由だった。
      diag.repaintReasons
    );
    if (verdict.level === 'bad' || verdict.level === 'warn') {
      parts.push(`⚠${verdict.label}(${verdict.detail})`);
    }
  }
  // v0.1.1248: 描き直しの【理由別内訳】。犯人が過半を占めていれば名指しする。
  //   拮抗しているときは名指ししない(=特定の1箇所を直しても効かないと分かる)。
  const reasonLine = formatRepaintReasonLine(diag.repaintReasons, diag.commentCount);
  if (reasonLine) parts.push(reasonLine);
  if (diag.tabVisible === false) parts.push('裏タブ');
  if (diag.tabCount != null) parts.push(`タブ ${diag.tabCount}`);
  if (diag.commentCount != null) {
    parts.push(`コメント ${diag.commentCount.toLocaleString('ja-JP')}`);
  }
  if (diag.deferActive) parts.push('描画見送り中');
  // v0.1.854: 「スクロールで白・放置でローディング固着」を DOM/F12 不要で切り分ける。
  //   panelPainted===false かつ コメントがある=パネルが白(未描画)。shadeActive===true=幕が残っている。
  //   どちらも『本当におかしい時だけ』出す(描画済/幕無しなら出さない=ノイズにしない)。
  if (diag.panelPainted === false && (diag.commentCount == null || diag.commentCount > 0)) {
    // v0.1.982: スクロール見送り中の白化は別メッセージにして「スクロールで白くなる」と一発で分かるように。
    parts.push(diag.deferActive ? '⚠スクロール中に白くなっています(描画見送り)' : '⚠パネル未描画(白)');
  }
  if (diag.shadeActive === true) parts.push('⚠ローディング継続');
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

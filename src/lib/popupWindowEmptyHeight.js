/**
 * 0.1.71 (BA): popup window の高さを「state（active watch / empty+history /
 * empty+no-history）に応じて」変える純粋関数群。
 *
 * 経緯:
 * - 0.1.58 (AN) で popup window を毎回 420×780 に強制リセット
 * - 0.1.69-0.1.70 で empty state の中身を「前回の配信」cards に変更し、
 *   active watch 用の UI（応援 hero / コメ送信欄 等）を hide
 * - 結果、empty state では実際のコンテンツが ~580px しか無いのに
 *   window の高さは 780px のまま → **下に ~200px の白い空きスペース**
 *
 * 設計:
 * - active watch: 既存の 780px 維持（CWS 提出済の見た目を変えない）
 * - empty + history: 620px（4 ボタン + indicator + button + 3 cards + 詳細設定）
 * - empty + no-history: 480px（4 ボタン + 詳細設定 + 更新履歴 + 拡張について + 配色）
 * - viewportHint で content の実測高さを渡せば、それに chromeOverhead（タイトル
 *   バー等のための余裕）を足した値で上書き可能
 * - 必ず MIN/MAX の範囲内にクランプ（OS による微小なズレ吸収）
 *
 * 純粋なので popupWindowEmptyHeight.test.js で全網羅テスト可能。
 */

/** popup window の幅（width は state に依らず固定） */
export const POPUP_WINDOW_WIDTH = 420;

/** active watch の popup window 高さ（0.1.58 以降の既定） */
export const POPUP_WINDOW_HEIGHT_ACTIVE_WATCH = 780;

/** empty state + 履歴ありの popup window 高さ
 *  CSS の `html:not(.nl-inline) { height: min(..., 580px) }` で body 高さは 580px に
 *  cap される。outer = 580 + 40（OS chrome 余裕）= 620 にすれば body cap が
 *  inner viewport にぴったり収まり、白い空き帯がゼロになる。
 *  content がそれを超える分は body 内 .nl-main の overflow:auto で scroll。 */
export const POPUP_WINDOW_HEIGHT_EMPTY_WITH_HISTORY = 620;

/** empty state + 履歴ゼロ（first-time）の popup window 高さ
 *  ranking 4 ボタン + 詳細設定 + 更新履歴 + 拡張について + 配色 + powered-by で
 *  実測 ~550px。outer 600 = inner 560、body cap 580 が inner で抑えられて 560、
 *  content 550 ≦ 560 でほぼスクロールなし、白い空きもごく僅か。 */
export const POPUP_WINDOW_HEIGHT_EMPTY_NO_HISTORY = 600;

/** クランプ用の MIN（OS / Chrome の最小窓サイズを下回らないように） */
export const POPUP_WINDOW_MIN_HEIGHT = 360;

/** クランプ用の MAX（巨大ディスプレイで暴れないように） */
export const POPUP_WINDOW_MAX_HEIGHT = 1100;

/**
 * @typedef {{
 *   contentHeightPx?: number,
 *   chromeOverheadPx?: number
 * }} ViewportHint
 *
 * @typedef {{
 *   emptyState?: boolean,
 *   hasHistory?: boolean,
 *   viewportHint?: ViewportHint
 * }} ComputeInput
 */

/**
 * `chrome.windows.create` / `chrome.windows.update` に渡す `height` を返す。
 *
 * @param {ComputeInput} [input]
 * @returns {number}
 */
export function computePopupWindowTargetHeight(input) {
  const params = input && typeof input === 'object' ? input : {};
  const emptyState = params.emptyState === true;
  const hasHistory = params.hasHistory === true;

  // viewportHint が有効ならそれを優先（実測ベース）
  const hint = params.viewportHint;
  if (hint && typeof hint === 'object') {
    const c = Number(hint.contentHeightPx);
    const ov = Number(hint.chromeOverheadPx);
    if (Number.isFinite(c) && c > 0 && Number.isFinite(ov) && ov >= 0) {
      const raw = Math.round(c + ov);
      return clamp(raw, POPUP_WINDOW_MIN_HEIGHT, POPUP_WINDOW_MAX_HEIGHT);
    }
  }

  if (!emptyState) return POPUP_WINDOW_HEIGHT_ACTIVE_WATCH;
  return hasHistory
    ? POPUP_WINDOW_HEIGHT_EMPTY_WITH_HISTORY
    : POPUP_WINDOW_HEIGHT_EMPTY_NO_HISTORY;
}

/**
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function clamp(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

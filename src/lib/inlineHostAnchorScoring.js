/**
 * 埋め込みパネル（inline host）の挿入アンカー候補をスコアリングする純粋関数。
 *
 * 経緯（0.1.64 / AT）:
 *   `findFrameInsertAnchorFromVideo` (content-entry.js) は video から祖先を
 *   辿って、視聴行（player + 公式コメ列）相当の矩形を anchor として選ぶ。
 *   旧スコアリングは `aspect <= 3.4 && area <= viewport*0.92` と緩く、
 *   ニコ生 SPA で「視聴行 + コメント欄 + バナー一式」を含む巨大ラッパー
 *   までヒットし、その直後（description / Amazon / 関連配信の直前）にパネルが
 *   挿入される事象が頻発していた。0.1.63 で below → dock_bottom の応急
 *   migration を入れ、本ファイルでスコアリング本体を「video rect とのジオメ
 *   トリ整合」（幅比・高さ比・top オフセット）まで含めて厳格化する。
 *
 * 設計:
 *   - 入力は video の getBoundingClientRect 由来の矩形と、候補祖先の矩形、
 *     viewport サイズ。DOM へは依存しない（jsdom 不要でテスト可能）。
 *   - eligibility（先に絞り込む）→ score（タイブレーク等）→ **呼び出し側で eligible のうち
 *     面積最小を優先**（巨大ラッパー除外）の三段。
 *   - 制限値は overrides 引数で個別に上書き可能（テスト・拡張のため）。
 *
 * 用語:
 *   - rect: 候補祖先の getBoundingClientRect
 *   - videoRect: video の getBoundingClientRect（横並び layout なら left/top
 *     はそれぞれの所属列の左上、video のみなら video そのもの）
 *   - viewport: { width: window.innerWidth, height: window.innerHeight }
 */

/**
 * @typedef {{ left: number, top: number, width: number, height: number }} RectLike
 * @typedef {{ width: number, height: number }} ViewportLike
 */

/**
 * @typedef {Object} InlineHostAnchorLimits
 * @property {number} minWidth                 候補の最小幅 (px)
 * @property {number} minHeight                候補の最小高さ (px)
 * @property {number} maxAreaRatio             候補の面積上限 / viewport 面積
 * @property {number} minAspect                aspect 下限（縦長を弾く）
 * @property {number} maxAspect                aspect 上限（横長すぎを弾く）
 * @property {number} minWidthRatioToVideo     候補幅 / video 幅 の下限
 * @property {number} maxWidthRatioToVideo     候補幅 / video 幅 の上限
 * @property {number} maxHeightRatioToVideo    候補高さ / video 高さ の上限
 * @property {number} maxTopOffsetFromVideo    候補 top と video top の差の上限 (px)
 */

/** @type {Readonly<InlineHostAnchorLimits>} */
export const DEFAULT_INLINE_HOST_ANCHOR_LIMITS = Object.freeze({
  minWidth: 260,
  minHeight: 140,
  maxAreaRatio: 0.6,
  minAspect: 1,
  maxAspect: 2.6,
  minWidthRatioToVideo: 0.95,
  maxWidthRatioToVideo: 1.6,
  // 0.1.88: maxHeightRatioToVideo を 3.5 → 2.0 に絞る。
  //   3.5 だと video + タグ + 配信者情報 + 関連作品 + アドバナーまで含む
  //   巨大な wrapper まで eligible になり、その直後（page 末尾）に panel が
  //   挿入される事故が発生していた（ニコ生 SEKIRO 系の縦積みレイアウト）。
  //   2.0 = video の真下に「公式コメント列 + UI 1〜2 段」程度までに収める。
  maxHeightRatioToVideo: 2.0,
  maxTopOffsetFromVideo: 120
});

const ASPECT_IDEAL = 16 / 9;
const IDEAL_WIDTH_RATIO = 1.15;

/**
 * 縦積み（動画の下に公式コメント列）になりやすい幅では、プレイヤー行ラッパーが
 * video 単体より縦に長くなる。`maxHeightRatioToVideo` を既定のままにすると候補が
 * すべて不合格になり、アンカーが video に落ちて「動画とコメントの間」にパネルが挟まる。
 *
 * 緩和は「動画がビューポート幅の大半を占める」ときだけに限定し、`maxAreaRatio` /
 * `maxAspect` / `maxWidthRatioToVideo` による巨大ページラッパー除外は維持する。
 *
 * @param {ViewportLike} viewport  layout / visual のどちらでもよいが呼び出し側で統一すること
 * @param {RectLike} videoRect
 * @returns {Partial<InlineHostAnchorLimits>}
 */
export function stackedLayoutAnchorOverrides(viewport, videoRect) {
  const vw = Number(viewport?.width) || 0;
  const vh = Number(viewport?.height) || 0;
  const vidW = Number(videoRect?.width) || 0;
  if (vw < 280 || vh < 280 || vidW < 200) return {};

  const widthCoverage = vidW / Math.max(vw, 1);
  const narrowViewport = vw <= 1100;
  const videoSpansMostWidth = widthCoverage >= 0.72;
  const veryNarrow = vw <= 560;

  if ((!narrowViewport || !videoSpansMostWidth) && !veryNarrow) return {};

  return {
    maxAreaRatio: 0.84,
    maxHeightRatioToVideo: 3.25,
    maxTopOffsetFromVideo: 168,
    // 縦積みではラッパーが「viewport 幅 ×（動画＋公式コメント列）」で縦長になりやすい。
    // minAspect=1 のままだと該当ラッパーがすべて不合格になり、アンカーが video に落ちる。
    minAspect: 0.42
  };
}

/**
 * eligible 祖先が複数あるとき、スコア最大（≈面積が大きいほど有利）だけだと **浅い巨大ラッパー**
 * が選ばれ、`afterend` 挿入が関連放送・概要より下になりページ末尾までパネルが流れる。
 *
 * video より十分広い／高い矩形だけを「コメ列などプレイヤー行を包含している」候補とみなし、
 * そのサブセットで **面積最小** を選ぶ。サブセットが空なら eligible 全体で面積最小。
 *
 * @param {ReadonlyArray<{ idx: number, area: number, score: number, width: number, height: number }>} rows
 * @param {{ width: number, height: number }} videoRect
 * @returns {number} rows[].idx を返す。rows が空なら -1。
 */
export function pickTightestEligibleAnchorRowIdx(rows, videoRect) {
  const vw = Math.max(1, Number(videoRect.width) || 0);
  const vh = Math.max(1, Number(videoRect.height) || 0);
  if (!rows.length) return -1;

  const expanded = rows.filter(
    (r) =>
      Number(r.width) >= vw * 1.06 || Number(r.height) >= vh * 1.08
  );
  const pool = expanded.length ? expanded : rows;

  const sorted = [...pool].sort((a, b) => {
    const da = Number(a.area) || 0;
    const db = Number(b.area) || 0;
    if (da !== db) return da - db;
    return (Number(b.score) || 0) - (Number(a.score) || 0);
  });
  return sorted[0].idx;
}

/**
 * @param {{ rect: RectLike, viewport: ViewportLike, videoRect: RectLike }} input
 * @param {Partial<InlineHostAnchorLimits>} [overrides]
 * @returns {{ eligible: boolean, score: number, reason: string }}
 */
export function scoreInlineHostAnchorCandidate(input, overrides = {}) {
  const limits = { ...DEFAULT_INLINE_HOST_ANCHOR_LIMITS, ...overrides };
  const { rect, viewport, videoRect } = input;
  const viewportArea = Math.max(1, viewport.width * viewport.height);
  const area = Math.max(0, rect.width * rect.height);
  const aspect = rect.width / Math.max(rect.height, 1);

  if (rect.width < limits.minWidth) {
    return { eligible: false, score: 0, reason: 'width<min' };
  }
  if (rect.height < limits.minHeight) {
    return { eligible: false, score: 0, reason: 'height<min' };
  }
  if (area > viewportArea * limits.maxAreaRatio) {
    return { eligible: false, score: 0, reason: 'area>max' };
  }
  if (aspect < limits.minAspect) {
    return { eligible: false, score: 0, reason: 'aspect<min' };
  }
  if (aspect > limits.maxAspect) {
    return { eligible: false, score: 0, reason: 'aspect>max' };
  }

  const videoWidth = Math.max(1, videoRect.width);
  const videoHeight = Math.max(1, videoRect.height);
  const widthRatio = rect.width / videoWidth;
  const heightRatio = rect.height / videoHeight;
  const topOffset = Math.abs(rect.top - videoRect.top);

  if (widthRatio < limits.minWidthRatioToVideo) {
    return { eligible: false, score: 0, reason: 'width<videoMin' };
  }
  if (widthRatio > limits.maxWidthRatioToVideo) {
    return { eligible: false, score: 0, reason: 'width>videoMax' };
  }
  if (heightRatio > limits.maxHeightRatioToVideo) {
    return { eligible: false, score: 0, reason: 'height>videoMax' };
  }
  if (topOffset > limits.maxTopOffsetFromVideo) {
    return { eligible: false, score: 0, reason: 'topOffset>max' };
  }

  const aspectPenalty = Math.min(Math.abs(aspect - ASPECT_IDEAL), 1.1) * 0.18;
  const widthPenalty =
    Math.min(Math.abs(widthRatio - IDEAL_WIDTH_RATIO), 0.6) * 0.15;
  const score = area * (1 - aspectPenalty - widthPenalty);
  return { eligible: true, score, reason: 'ok' };
}

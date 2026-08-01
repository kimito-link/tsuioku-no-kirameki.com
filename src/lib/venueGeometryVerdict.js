/**
 * 会場と①POPのタイル寸法差が「CSS不整合」か「測定対象ズレ」かを見分ける純関数(v0.1.1212)。
 *
 * 2026-08-01 の実測(lv351079683)で `幾何≠ link:128×40px(①110×38px)` が出たが、
 * 調査の結果 ①popup.html と venueBar.js の当該CSSは**バイト単位で同一**だった
 * (v0.1.1163 で移植した `max-width: min(142px,34vw)` / `font-size:11px` は無傷)。
 *
 * つまり寸法差の原因はCSSではなく、次のどちらか:
 *   (a) 測定対象ズレ — 計器は各段の【先頭タイル1枚】だけを測る(laneDomSelfMeasure.js /
 *       venueDomCensus.js)。①と会場で先頭に来る人が違えば、meta は max-width までの
 *       収縮ボックスなので【名前が長い人ほどタイルが広い】。CSSが完全一致でも差が出る。
 *   (b) 本物のCSS不整合 — 同一人物を測っているのに寸法が違う。
 *
 * (a) を (b) と report すると、直す必要のないCSSを触って壊す。逆に (b) を (a) と
 * 片付けると本物の不一致を見逃す。**同一人物を測れているときだけCSS不整合を疑う**のが正しい。
 *
 * ★この関数は判定だけ。DOM にも描画にも一切触れない。
 *
 * @module venueGeometryVerdict
 */

/** @param {unknown} v */
function keyOf(v) {
  return String(v == null ? '' : v).trim();
}

/**
 * @typedef {'css_mismatch'|'measured_different_people'|'unknown_target'} VenueGeometryCause
 */

/**
 * 寸法差の原因を判定する。
 *
 * @param {{ tileKey?: unknown }|null|undefined} popupGeometry ①POP側の計測(先頭タイル)
 * @param {{ tileKey?: unknown }|null|undefined} venueGeometry 会場側の計測(先頭タイル)
 * @returns {{ cause: VenueGeometryCause, sameTarget: boolean, note: string }}
 *   cause: css_mismatch=同一人物なのに寸法が違う(本物) /
 *          measured_different_people=別人を測っている(幾何差とは言えない) /
 *          unknown_target=どちらかのキーが取れず判定不能
 */
export function classifyVenueGeometryDiff(popupGeometry, venueGeometry) {
  const popKey = keyOf(popupGeometry?.tileKey);
  const venueKey = keyOf(venueGeometry?.tileKey);
  if (!popKey || !venueKey) {
    return {
      cause: 'unknown_target',
      sameTarget: false,
      note: '測定対象の識別子が取れず、CSS差か測定ズレか判定できません'
    };
  }
  if (popKey === venueKey) {
    return {
      cause: 'css_mismatch',
      sameTarget: true,
      note: '同一人物を測って寸法が違う=CSSの不一致'
    };
  }
  return {
    cause: 'measured_different_people',
    sameTarget: false,
    note: `別人を測っています(①${popKey} / 会場${venueKey})=名前の長さ差で、CSS不一致ではありません`
  };
}

/**
 * 判定を状態速報の1行に整形する。
 *
 * @param {string} label 段の名前(link/ad など)
 * @param {ReturnType<typeof classifyVenueGeometryDiff>} verdict
 * @returns {string}
 */
export function formatVenueGeometryCause(label, verdict) {
  const cause = verdict?.cause;
  if (cause === 'css_mismatch') return `${label}:幾何差(同一人物=CSS不一致)`;
  if (cause === 'measured_different_people') return `${label}:測定対象ズレ(別人=CSS不一致ではない)`;
  return `${label}:幾何差(対象不明)`;
}

/**
 * paintCompletionProbe — 「JSが返った時点」でなく【画面に出るまで】を測る(v0.1.1320)。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ★なぜ要るか（2026-08-10・診断ページが重い件で判明した計器の欠陥）
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 状態速報は長らくこう出していた:
 *     更新所要(計器): 6ms(重い順: render 3ms / lives 2ms)
 * 私はこれを「拡張は軽い＝重さは環境のせい」と読んだ。**それは誤りだった。**
 *
 * 既存の計器は `renderAll()` から【JSが返った時点】で止まる(status-entry.js の `_mark('render')`)。
 * ブラウザの style/layout/paint は**その後**に走るので、計器の【外】にある。
 * ＝「render 3ms」は「JSが3msで返った」であって「画面が3msで出た」ではない。
 *
 * ★同じリポに反証が残っていた(status-entry.js の実測コメント):
 *     「1回目 12,610ms(extras 12,607 / render 3) → 2回目 5ms」
 *   render 3ms のときに実所要 12,610ms＝**render が小さくても重い**ことは証明済みだった。
 *
 * ■ 何を測るか
 *   `requestAnimationFrame` は「次の描画の直前」に呼ばれる。
 *   その中で `setTimeout(...,0)` を張ると「描画が終わった直後」に戻ってくる。
 *   この2点で、JSが返ってから【実際に画面へ反映されるまで】を挟み込める。
 *     renderAll終了 → (rAF) → style/layout/paint → (timeout0)
 *   ＝ `toPaintMs` が大きければ、重いのは JS でなく **DOMを作り直しすぎている**こと。
 *
 * ■ 責務を分けた理由
 *   タイマー登録は呼び手(status-entry)が持ち、ここは【判定と文字列】だけ持つ＝テスト可能にする。
 *
 * @module paintCompletionProbe
 */

/** これを超えたら「描画が重い」と名指しする閾値(ms)。 */
export const PAINT_HEAVY_MS = 120;

/**
 * @typedef {{ samples: number[], lastToPaintMs: number, worstToPaintMs: number }} PaintProbeState
 */

/** @returns {PaintProbeState} */
export function createPaintProbeState() {
  return { samples: [], lastToPaintMs: -1, worstToPaintMs: -1 };
}

/**
 * 1サイクル分の「JSが返ってから画面に出るまで」を記録する。
 * @param {PaintProbeState} state
 * @param {number} toPaintMs
 * @param {{ maxSamples?: number }} [opts]
 */
export function observePaintCompletion(state, toPaintMs, opts) {
  if (!state || typeof state !== 'object') return;
  /*
   * ★測れていない値を「0ms」として取り込まない(嘘をつかない)。
   *   Number(null) は 0、Number([]) も 0 になるので `typeof` で先に弾く。
   *   ここを Number() だけで判定していたら null が「0ms＝一瞬で描けた」として
   *   平均を押し下げ、**軽く見せる方向に嘘をつく**計器になっていた
   *   (テストが実際にこれを捕まえた)。
   */
  if (typeof toPaintMs !== 'number') return;
  const ms = toPaintMs;
  if (!Number.isFinite(ms) || ms < 0) return;
  const rounded = Math.round(ms);
  state.lastToPaintMs = rounded;
  if (rounded > (Number(state.worstToPaintMs) || -1)) state.worstToPaintMs = rounded;
  if (!Array.isArray(state.samples)) state.samples = [];
  state.samples.push(rounded);
  const max = Number(opts?.maxSamples);
  const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : 20;
  while (state.samples.length > cap) state.samples.shift();
}

/**
 * 状態速報の1行にする。★「JSは速いが画面が遅い」を名指しする。
 *
 * @param {PaintProbeState|null|undefined} state
 * @param {{ jsMs?: number }} [ctx] jsMs=既存計器の totalMs(JSが返るまで)
 * @returns {string} 未観測なら ''
 */
export function formatPaintCompletionLine(state, ctx) {
  if (!state || typeof state !== 'object') return '';
  const samples = Array.isArray(state.samples) ? state.samples : [];
  if (samples.length === 0) return '';
  const last = Number(state.lastToPaintMs);
  const worst = Number(state.worstToPaintMs);
  const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);

  const jsRaw = Number(ctx?.jsMs);
  const jsMs = Number.isFinite(jsRaw) && jsRaw >= 0 ? Math.round(jsRaw) : null;

  let verdict = '';
  if (last > PAINT_HEAVY_MS) {
    verdict =
      ' ★重いのは【画面に出すまで】です' +
      (jsMs != null ? `(JSは${jsMs}ms)` : '') +
      '＝DOMを作り直しすぎている疑い(拡張の中で直せます)';
  }

  return (
    `描画完了まで: 直近${Number.isFinite(last) && last >= 0 ? last : '?'}ms` +
    `(平均${avg}ms / 最悪${Number.isFinite(worst) && worst >= 0 ? worst : '?'}ms)` +
    verdict
  );
}

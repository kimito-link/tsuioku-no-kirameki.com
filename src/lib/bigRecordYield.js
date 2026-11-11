/**
 * 大きな記録(数万行・数千人)を扱うとき、長い仕事の合間に画面へ手を返すための決まり(v0.1.1997)。
 *
 * 背景(PC 実測 2026-11-10・Kick 81,110行・約6,500人): 記録の読み出しが終わった続きで、
 *   行の組み立て → 正規化 → 名前と顔の控えの重ね直し → 描画 が1本の仕事として続き、約5秒(遅い PC では
 *   その数倍)画面が固まっていた。合計の仕事は同じでも、合間に手を返せば押した操作・スクロールが通る。
 *
 * ふつうの大きさの配信では手を返さない(今までと同じ順番・同じ速さ)。
 */

/** この行数以上の記録で、段の合間に手を返す */
export const BIG_RECORD_YIELD_MIN_ROWS = 20000;
/** この人数以上の応援マスで、組み立てを次の仕事へ回す(laneSecondRenderPolicy と同じ線) */
export const BIG_RECORD_YIELD_MIN_PEOPLE = 2000;

/**
 * @param {unknown} rows 行数
 * @returns {boolean}
 */
export function shouldYieldForBigRecord(rows) {
  const n = Number(rows);
  return Number.isFinite(n) && n >= BIG_RECORD_YIELD_MIN_ROWS;
}

/**
 * @param {unknown} people 人数
 * @returns {boolean}
 */
export function shouldDeferLanePaintForBigRecord(people) {
  const n = Number(people);
  return Number.isFinite(n) && n >= BIG_RECORD_YIELD_MIN_PEOPLE;
}

/**
 * 今の仕事を切り上げて、画面(入力・描画)に手を返す。
 * @returns {Promise<void>}
 */
export function yieldToMainThread() {
  const host = typeof globalThis !== 'undefined' ? globalThis : undefined;
  const sched = host && /** @type {{ scheduler?: { yield?: () => Promise<void> } }} */ (host).scheduler;
  if (sched && typeof sched.yield === 'function') return sched.yield();
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

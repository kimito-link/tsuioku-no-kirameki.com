/**
 * refreshCycleDeadline.js — 1サイクル全体の締切を持ち、各 read の timeout を残り時間に切り詰める。
 *
 * ■ なぜ要るか(2026-08-14 ユーザー実機「診断おもくてひらかない」の真因)
 *   status-entry.js の `refresh()` は storage read を **timeout付きで10本、直列に await** する。
 *   既定 tmo=8000ms なので、全部が詰まると **10 × 8000 = 80秒/サイクル**。
 *   ★1本ずつ見ると全部「有界化済み」で正しく見えるのに、**合計に上限が無い**。
 *   refresh は REFRESH_INTERVAL_MS(2秒)ごとに回るので、2サイクル目で180秒を超える
 *   = ユーザーの「180秒経っても開かない」と一致する。
 *
 * ■ なぜ Promise.all で並列化して解かないか(★退行の実績あり・触るな)
 *   chrome.storage.local は単一 LevelDB で **並行 read が stall する**。
 *   v0.1.867 で並列化したら timeout 多発 → fastDiag={}・記録0 の空表示という退行を出し、
 *   v0.1.868 で **直列へ戻した**(status-entry.js:721-723 のコメントが正本)。
 *   ＝**直列は維持したまま、合計を有界にする**のがこの module の役割。
 *
 * ■ 設計
 *   - サイクル開始時に `createRefreshDeadline(totalMs)` を作る
 *   - 各 read の直前に `next(defaultMs)` を呼び、**残り時間と既定値の小さい方**を使う
 *   - 残りが `minSliceMs` を切ったら 0 を返す = 呼び出し側は「もう読まない」を選べる
 *
 * ★ガードを足す方向で直さないこと。**ガード(個別timeout)がこの症状を作っている**。
 *   ここでやるのは「ガードを増やす」ではなく「ガードの合計に天井を付ける」。
 *
 * @module refreshCycleDeadline
 */

/**
 * 1サイクルの既定の総予算[ms]。
 *
 * ★v0.1.1410: 12,000 → 4,000 に締める(2026-08-16 実機「診断ページがまた重い」)。
 *   実測 `更新所要 6004ms(popupDiag 1471 / extras 1454 / summaries 1278)` は
 *   **12秒の予算内なので何にも止められていなかった**。
 *   ＝ 予算が「事故を防ぐ上限」としては機能していたが、
 *     「体感を守る上限」としては緩すぎた。
 *   ★REFRESH_INTERVAL_MS(2秒)の2倍。これを超えるなら、その回は
 *     stale(直近値)で描く方が**画面が出ない時間より必ず良い**。
 */
export const REFRESH_CYCLE_BUDGET_MS = 4_000;

/**
 * ★v0.1.1410: 初回サイクルの予算[ms]。**ページが開くまでの時間はこれで決まる**。
 *
 *   初回は `first: true` で congested 扱いになり、全 read を通そうとするが、
 *   ユーザーが待っているのは「開くこと」であって「完全な値」ではない。
 *   1.5秒で切り上げ、足りない分は次のサイクル(2秒後)が埋める。
 *   ★初回に限り stale すら無い(キャッシュ空)ので一部が「—」になるが、
 *     **白い画面より必ず良い**([[unbounded-await-at-boot-makes-page-blank]])。
 */
export const REFRESH_FIRST_CYCLE_BUDGET_MS = 1_500;

/** これを下回る残り時間では read を発行しない[ms](発行しても実質間に合わないため)。 */
export const MIN_SLICE_MS = 150;

/**
 * @typedef {object} RefreshDeadline
 * @property {(defaultMs: number) => number} next 次の read に与える timeout[ms]。0 なら読まない。
 * @property {() => number} remaining 残り[ms](0以上)。
 * @property {() => boolean} expired 予算を使い切ったか。
 * @property {() => number} elapsed 経過[ms]。
 * @property {() => number} skipped `next()` が 0 を返した回数(計器用)。
 */

/**
 * サイクル締切を作る。
 *
 * @param {object} [opts]
 * @param {number} [opts.totalMs] 総予算[ms]。既定 REFRESH_CYCLE_BUDGET_MS。
 * @param {number} [opts.minSliceMs] 最小スライス[ms]。既定 MIN_SLICE_MS。
 * @param {() => number} [opts.now] 時刻源(テスト用)。既定 performance.now/Date.now。
 * @returns {RefreshDeadline}
 */
export function createRefreshDeadline(opts = {}) {
  const totalMs = toPositive(opts.totalMs, REFRESH_CYCLE_BUDGET_MS);
  const minSliceMs = toPositive(opts.minSliceMs, MIN_SLICE_MS);
  const now = typeof opts.now === 'function' ? opts.now : defaultNow;
  const t0 = now();
  let skipped = 0;

  const elapsed = () => Math.max(0, now() - t0);
  const remaining = () => Math.max(0, totalMs - elapsed());

  return {
    elapsed,
    remaining,
    expired: () => remaining() <= 0,
    skipped: () => skipped,
    next(defaultMs) {
      const want = toPositive(defaultMs, 0);
      const left = remaining();
      // 残りが最小スライス未満 = もう読ませない(呼び出し側が stale/空で描く)。
      if (left < minSliceMs) {
        skipped += 1;
        return 0;
      }
      // 既定値と残り時間の小さい方。want=0(既定未指定)なら残り全部は渡さず left を返す。
      if (want <= 0) return left;
      return Math.min(want, left);
    }
  };
}

/** @param {unknown} v @param {number} fallback @returns {number} */
function toPositive(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** @returns {number} */
function defaultNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/**
 * 直列 read の「最悪合計」を計算する(検査・説明用の純関数)。
 *
 * ★この関数の存在理由: 「各所を有界化した」は「全体が有界」ではない、を**数で示す**ため。
 *   有界化を N 箇所に足したら必ず N×timeout を計算する、という掟をコードに刻む。
 *
 * @param {number} readCount 直列に並ぶ read の本数
 * @param {number} perReadMs 1本あたりの timeout[ms]
 * @returns {number} 最悪合計[ms]
 */
export function worstCaseSerialMs(readCount, perReadMs) {
  const n = Math.max(0, Math.floor(Number(readCount) || 0));
  const ms = Math.max(0, Number(perReadMs) || 0);
  return n * ms;
}

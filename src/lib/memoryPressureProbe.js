/**
 * memoryPressureProbe.js — メモリ消費とDOM総数を「凍結の予兆」として判定する純関数
 * (v0.1.1454・2026-08-19 ユーザー指示「メモリの消費とかも計器にいれて」)。
 *
 * ■ なぜ要るか(実機の症状)
 *   watch ページに Chrome の「ページが応答しません」ダイアログが出た。
 *   ★凍っていたのは【拡張のパネル】ではなく **watch ページ本体**。
 *   同じ速報で `中身LOD 枠だけ0枚/全0枚` ＝ **LODが一度も効いていない**。
 *
 *   ★2026-08-20 訂正: ここには「会場モードのタイルが たぬ姉332枚」と書いていたが
 *   **誤り**。`会場一致 … tanu332` の 332 は `venueLaneParity.js:389` が出す
 *   **鏡(mirror)データ上の件数**であって **DOMのタイル枚数ではない**。
 *   実DOM枚数を見るなら同じ行の **`可視N`**(`venueLaneParity.js:263`/`:283`)。
 *   ★この取り違えこそ `instrumentSpec.js` の `unit` 列が防ぐ誤診そのもの
 *   (`venue-lane-pop` は `unit:'mirror_records'` と宣言してある)。
 *
 *   ★このリポには **メモリもDOM総数も測る計器が1つも無かった**(grep で確認済み)。
 *   「重い」「凍る」と言われても**数字で答えられない**＝原因に到達できない。
 *   ([[instrument-must-name-the-cause-2026-08-01]])
 *
 * ■ 判定の設計
 *   `performance.memory` は **Chrome 限定 / 同一プロセスのJSヒープのみ**。
 *   ★絶対値(MB)は端末とタブ構成で意味が変わるので **上限に対する割合**で判定する。
 *   ★取れない環境では **na**(測っていない)を返す。**0 と混同しない**
 *   ([[unobserved-must-not-hide-the-cell-2026-08-15]] / [[zero-count-may-mean-unmeasured-2026-08-04]])。
 *
 *   DOM総数は別軸。**メモリに余裕があってもDOMが多いだけで凍る**ので独立に判定する
 *   (このリポの実測: DOM 13,682＝業界基準1,500の9倍・`docs/kb-web-perf-diagnosis.md`)。
 *
 * この lib は DOM にも performance にも触らない。採取は呼び出し側が行い、値を渡す。
 */

/** ヒープ使用率がこれを超えたら警告(%)。 */
export const MEMORY_PRESSURE_WARN_PCT = 70;

/** ヒープ使用率がこれを超えたら危険(%)＝このままだとタブが落ちる/凍る。 */
export const MEMORY_PRESSURE_BAD_PCT = 85;

/**
 * DOM総数の警告水準。
 *
 * ★★2026-08-31: 1,500 → 3,900 に引き上げた（★根拠を「業界推奨」から「自分の実測」へ）。
 *
 * ■ なぜ 1,500 をやめたか
 *   ★その根拠だった Lighthouse の `dom-size` 監査は 13.0(2025-10)で【廃止】された。
 *     新しい `dom-size-insight` は静的な要素数を見ず、
 *     「recalc/layout が 40ms を超えたか」で判定する。
 *     https://developer.chrome.com/docs/performance/insights/dom-size
 *   ★実測(Chrome で popup.html を計測): 7,053要素でも recalc+layout は 15.6ms
 *     ＝ 40ms の半分以下。1,500 では【健全な状態で警告が出る】。
 *
 * ■ なぜ 0 にせず 3,900 を残すのか
 *   ★このリポには「DOMが多いときに実際に凍った」実測がある:
 *     状態ページが 3,984要素 で 29.3秒かかった(changelog-archive.js:45)。
 *     ＝ 桁が違えば実害は出る。信号そのものは捨てない。
 *   ⟹ ★「業界がそう言うから」ではなく「**この製品で実際に凍った水準**」を基準にする。
 *     3,900 は上記実測(3,984)のすぐ下＝あの事故を再び検知できる位置。
 *
 * ★注意: これは「要素数が多い」という**相関**の警告であって、原因の断定ではない。
 *   実際に遅いかは recalc/layout の実測が要る(この製品にはまだその計器が無い)。
 */
export const DOM_NODES_WARN = 3_900;

/** DOM総数がこれを超えたら危険(実測で凍結を伴った水準)。 */
export const DOM_NODES_BAD = 5_000;

/**
 * @typedef {object} MemoryPressureVerdict
 * @property {'ok'|'warn'|'bad'|'na'} level ヒープの判定(na=測れない環境)。
 * @property {number|null} usedMB 使用中のJSヒープ(MB・null=測れない)。
 * @property {number|null} limitMB 上限(MB・null=測れない)。
 * @property {number|null} pct 上限に対する使用率(%・null=測れない)。
 * @property {number|null} domNodes DOM総数(null=測っていない)。
 * @property {'ok'|'warn'|'bad'|'na'} domLevel DOM総数の判定。
 * @property {string} text 人が読む1行。
 */

/** @param {unknown} v @returns {number|null} */
function finiteOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * メモリ逼迫とDOM肥大を判定する純関数。
 *
 * ★`performance.memory` が無い環境(Firefox 等)では **na** を返す。
 *   「0%」と言い張ると、測れていないのに正常だと誤読される。
 *
 * @param {{ usedJSHeapSize?: unknown, jsHeapSizeLimit?: unknown }|null|undefined} mem
 *   `performance.memory` 相当(そのまま渡してよい)。
 * @param {{ domNodes?: unknown }} [opts] DOM総数(`document.getElementsByTagName('*').length`)。
 * @returns {MemoryPressureVerdict}
 */
export function judgeMemoryPressure(mem, opts) {
  const used = finiteOrNull(mem && /** @type {any} */ (mem).usedJSHeapSize);
  const limit = finiteOrNull(mem && /** @type {any} */ (mem).jsHeapSizeLimit);

  const domNodes = finiteOrNull(opts && /** @type {any} */ (opts).domNodes);
  const domLevel = domNodes == null
    ? /** @type {'na'} */ ('na')
    : domNodes > DOM_NODES_BAD
      ? /** @type {'bad'} */ ('bad')
      : domNodes > DOM_NODES_WARN
        ? /** @type {'warn'} */ ('warn')
        : /** @type {'ok'} */ ('ok');

  const domText = domNodes == null ? '' : ` / DOM ${domNodes}個`;

  // ★測れない環境。0 ではなく「測れない」と言う。
  if (used == null || limit == null) {
    return {
      level: 'na',
      usedMB: null,
      limitMB: null,
      pct: null,
      domNodes,
      domLevel,
      text: `メモリ: ⚪この環境では測れません(Chrome以外は非対応)${domText}`
    };
  }

  const usedMB = Math.round(used / 1048576);
  const limitMB = Math.round(limit / 1048576);
  const pct = Math.round((used / limit) * 100);
  const level = pct >= MEMORY_PRESSURE_BAD_PCT
    ? /** @type {'bad'} */ ('bad')
    : pct >= MEMORY_PRESSURE_WARN_PCT
      ? /** @type {'warn'} */ ('warn')
      : /** @type {'ok'} */ ('ok');

  /*
   * ★数字だけ出して解釈を丸投げしない。「次の一手」まで書く
   *   ([[instrument-must-name-the-cause-2026-08-01]])。
   */
  const hint = level === 'bad'
    ? ' 🔴上限に迫っています(タブが落ちる/凍る前兆)'
    : level === 'warn'
      ? ' ⚠増え続けるなら開いている配信タブを減らしてください'
      : '';
  /*
   * ★文言から「推奨(1,500)」を外した(2026-08-31)。
   *   その基準は廃止済みで、実測でも問題が出ない水準だった＝**嘘の警告**になっていた。
   *   いまの警告は「この製品で実際に凍った水準(3,984要素/29.3秒)に近い」という意味。
   */
  const domHint = domLevel === 'bad'
    ? ' 🔴DOMが多すぎます(凍結の主因候補)'
    : domLevel === 'warn'
      ? ' ⚠DOMが多めです(過去に凍った水準に近い)'
      : '';

  return {
    level,
    usedMB,
    limitMB,
    pct,
    domNodes,
    domLevel,
    text: `メモリ: ${usedMB}MB / 上限${limitMB}MB (${pct}%)${hint}${domText}${domHint}`
  };
}

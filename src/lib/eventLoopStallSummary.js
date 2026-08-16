/**
 * eventLoopStallSummary.js — 観測列の「予定時刻 vs 実発火時刻」から
 * **イベントループが止まっていたか**を言う純関数。
 *
 * ★なぜ要るか(2026-08-12・黒画面7版が外れ続けた真因)
 *   サイドパネルの黒を7版追いかけて直らなかった。原因は【第一現象を取り違えていた】こと:
 *
 *     観測格子(SAMPLE_AT_MS)の 0〜12000ms の点数 = 16
 *     速報が報告した「窓0x0」の点数              = 16   ← 一致
 *     予定 12000ms のサンプルの実発火時刻        = 14574ms
 *     ─────────────────────────────────────
 *     イベントループ遅延 = 2,574ms
 *
 *   ★Chrome のパネル滑り出しではタイマーは遅れない。
 *   ＝窓0x0・幕の残留・シェードの残留は**すべて下流**で、第一現象は
 *   【拡張ページのメインスレッドが止まっていたこと】だった。
 *   [[stalled-event-loop-masquerades-as-paint-bug-2026-08-12]]
 *
 * ★この計器の価値は「次の一手を分岐させる」ことにある
 *   [[instrument-value-is-measured-by-fixes-2026-08-12]]: 読んでも直せない計器は価値が低い。
 *   この数字は**触れる/触れないの分岐そのもの**を決める:
 *     - 遅延が小さい(健全) … 幕/シェードの解除経路を詰める価値がある
 *     - 遅延が大きい(凍結) … 描画側をいくら直しても無駄。スレッドを止めている物を探す
 *   ★凍結と分かっているのに描画を直す版を重ねる、という7版ぶんの空振りを止めるための計器。
 *
 * ■ 判定の境目(1000ms)の根拠
 *   Chrome は hidden なページのタイマーを間引く(数百ms程度のずれは正常)。
 *   1秒を超える遅れは間引きでは説明できず、実行が詰まっている証拠として扱える。
 *
 * 掟: 数えるだけ・DOM を触らない・時刻は呼び出し側が渡す(テスト可能性)。
 *
 * @module eventLoopStallSummary
 */

/**
 * 「イベントループが止まっていた」と断定する遅延の境目(ms)。
 * これ未満は hidden タブのタイマー間引きで説明が付く範囲。
 */
export const EVENT_LOOP_STALL_MS = 1_000;

/**
 * @typedef {{ t: number, sched?: number|null }} StallSample
 */

/**
 * 観測列から最大タイマー遅延を要約する。
 *
 * @param {ReadonlyArray<StallSample>|null|undefined} series 観測列(t=実発火・sched=予定)
 * @returns {{
 *   observed: number,
 *   maxDelayMs: number,
 *   maxDelayAtSchedMs: number|null,
 *   stalled: boolean,
 *   line: string
 * }}
 */
export function summarizeEventLoopStall(series) {
  const list = Array.isArray(series) ? series : [];
  let maxDelayMs = 0;
  let maxDelayAtSchedMs = null;
  let observed = 0;

  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const t = Number(raw.t);
    /*
     * ★予定時刻を持たないサンプルは【数えない】(load/visible/reload 等の
     *   イベント起点の点は「予定」が無く、遅延を計算できない)。
     *   0 を遅延として混ぜると「遅延なし」と嘘をつく＝
     *   [[zero-count-may-mean-unmeasured-2026-08-04]] を計器自身が踏む形になる。
     *
     * ★`Number(null)` は 0(finite!)。素の Number() で弾こうとすると、
     *   sched:null の点が「予定0msちょうどに発火予定だった」と読まれ、
     *   実発火 14778ms がまるごと遅延として計上される＝**巨大な偽の停止**を報告する。
     *   計器が嘘をつく典型なので、null/undefined/'' を先に落とす。
     */
    const schedRaw = raw.sched;
    if (schedRaw == null || schedRaw === '') continue;
    const sched = Number(schedRaw);
    if (!Number.isFinite(t) || t < 0) continue;
    if (!Number.isFinite(sched) || sched < 0) continue;
    observed += 1;
    const delay = t - sched;
    if (delay > maxDelayMs) {
      maxDelayMs = delay;
      maxDelayAtSchedMs = sched;
    }
  }

  maxDelayMs = Math.max(0, Math.round(maxDelayMs));
  const stalled = maxDelayMs >= EVENT_LOOP_STALL_MS;

  if (observed === 0) {
    // 未観測を「遅延0=健全」と言わない(測っていないだけ)。
    return {
      observed: 0,
      maxDelayMs: 0,
      maxDelayAtSchedMs: null,
      stalled: false,
      line: 'タイマー遅延 ⚪ 未観測'
    };
  }

  /*
   * ★原因ではなく次の一手を1行で言う([[instrument-must-name-the-cause-2026-08-01]])。
   *   読み手(私)が「この版の合否をどちらのレジームで判定するか」を迷わないようにする。
   */
  const line = stalled
    ? `最大タイマー遅延=${maxDelayMs}ms 🔴イベントループ停止(予定t+${maxDelayAtSchedMs}msの点で検知)` +
      ' ★幕/シェードは下流=描画側を直しても消えない。スレッドを止めている処理を探すこと'
    : /*
       * ★v0.1.1416: 「健全」を全称で言わない(2026-08-16 実機・この1行が調査を止めた)。
       *   同じ速報に「最大タイマー遅延=753ms ✅イベントループは健全」と
       *   「即時プッシュ 配達平均47,686ms」が並び、両方とも嘘ではなかった。
       *   この計器が見ているのは【この文書の・タイマーが動く時間帯だけ】:
       *     - iframe の子(popup.html)は別勘定(longtask も別・親が健全でも子は詰まりうる)
       *     - hidden 中は Chrome がタイマーを間引くので観測から落ちる。
       *       ところが postMessage は間引かれない=配達 gap だけが hidden 中も伸び続ける。
       *   ＝「健全」と言い切れるのは可視かつ同一文書のときだけ。範囲を名乗る。
       *   [[measure-the-region-you-claim-2026-08-10]]
       */
      `最大タイマー遅延=${maxDelayMs}ms ✅この文書の可視中は健全(観測${observed}点)` +
      ' ※hidden中と子iframeは対象外=配達遅延の無罪証明にはならない';

  return { observed, maxDelayMs, maxDelayAtSchedMs, stalled, line };
}

/**
 * ndgrHiddenFlushThreshold.js — 裏タブで「コメントが数十秒遅れて出る」のを止める純関数。
 *
 * ■ 何が起きていたか(2026-08-16 実機・v0.1.1413 速報)
 *     即時プッシュ 配達平均 47,686ms
 *   コメントが47秒遅れて表示される。しかし受信側は健全だった(実測 配達5ms)。
 *
 * ■ 真因: Chrome の【裏タブ setTimeout クランプ】
 *   NDGR の取り込みは content-entry.js で
 *     setTimeout(flush, INGEST_TIMING.ndgrFlushMs /* 150ms *\/)
 *   に載っている。ところが Chrome は hidden なタブの setTimeout を
 *   **約1分に1回**までクランプする。
 *   ＝可視中 150ms ごとの吐き出しが、裏タブでは最大60秒に1回になる。
 *
 *   逃げ道として「N行 溜まったら即座に吐く」閾値(ndgrPendingThreshold=240)が
 *   あるが、240行は通常の配信ペースではすぐに埋まらない。
 *   ＝タイマーも来ない・閾値にも届かない、の板挟みで数十秒溜まる。
 *
 * ★このリポは**同じ罠を既に踏んで直している**:
 *   content-entry.js の v0.1.795 コメント曰く
 *   「背面タブは setInterval/setTimeout が間引かれ(1/分)、backfill crawl が
 *     seed すら取れず…SW は chrome.alarms(間引きに強い)で起き」
 *   ＝ backfill は chrome.alarms へ逃がして直したのに、
 *   **コメントの吐き出しだけ横展開されていなかった**(配線漏れ型)。
 *
 * ■ なぜ閾値を下げる形で直すか(タイマー側を触らない理由)
 *   タイマーをクランプ対象外の駆動(MessageChannel 等)へ移すと、
 *   裏タブでも 150ms ごとに動き続ける＝**電池/CPU を常時消費する**。
 *   一方この関数は「**溜まったら吐く**」の閾値を下げるだけなので、
 *   コメントが来ないときは何も動かない(イベント駆動のまま)。
 *   ＝裏タブの負荷を増やさずに、遅延の上限だけを下げられる。
 *
 * ■ なぜ「可視中は下げない」か
 *   可視中は 150ms タイマーが正常に効いており(実測 150〜199ms)、
 *   閾値を下げても得は無く、吐き出し回数だけが増える。
 *   v0.1.489/504 は高流量時の O(N) マージでページが固まる退行を踏んで
 *   **書き込み頻度を落とす**方向に調整してきた。その判断を壊さない。
 *
 * 掟: 数えるだけ・DOM を触らない・時刻や可視状態は呼び出し側が渡す(テスト可能性)。
 *
 * @module ndgrHiddenFlushThreshold
 */

/**
 * 裏タブでの「溜まったら吐く」行数しきい値。
 *
 * 40行の根拠: 実機で観測された配信は毎秒 数行〜十数行 のペース。
 *   40行なら数秒で埋まり、体感の遅延が「数十秒」から「数秒」へ落ちる。
 *   小さくしすぎると裏タブでの flush 回数が増え、
 *   裏タブの storage 書き込み(v0.1.504 で緩和した経路)を再び頻発させるため、
 *   「1桁秒に収まる」最小限に留める。
 */
export const NDGR_HIDDEN_PENDING_THRESHOLD = 40;

/**
 * いま使うべき「溜まったら吐く」行数しきい値を返す。
 *
 * @param {{ hidden?: boolean, visibleThreshold?: number, hiddenThreshold?: number }} [opts]
 *   hidden … タブが非表示か(呼び出し側が document.hidden 等から渡す)
 *   visibleThreshold … 可視中のしきい値(既定は呼び出し側の INGEST_TIMING 値を渡す)
 *   hiddenThreshold … 裏タブのしきい値(既定 NDGR_HIDDEN_PENDING_THRESHOLD)
 * @returns {number} 1以上の整数。
 */
export function resolveNdgrPendingThreshold(opts = {}) {
  const visibleRaw = Number(opts.visibleThreshold);
  const visible =
    Number.isFinite(visibleRaw) && visibleRaw >= 1 ? Math.floor(visibleRaw) : 240;
  if (opts.hidden !== true) return visible;

  const hiddenRaw = Number(opts.hiddenThreshold);
  const hidden =
    Number.isFinite(hiddenRaw) && hiddenRaw >= 1
      ? Math.floor(hiddenRaw)
      : NDGR_HIDDEN_PENDING_THRESHOLD;

  /*
   * ★可視中より大きくしない。
   *   呼び出し側が可視中の値を極端に小さく設定した場合に、
   *   「裏タブのほうが溜め込む」という逆転を起こさないための安全側。
   */
  return Math.min(visible, hidden);
}

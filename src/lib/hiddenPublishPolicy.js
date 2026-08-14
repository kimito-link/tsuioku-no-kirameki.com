/**
 * hiddenPublishPolicy.js — 「画面が隠れているとき、鏡の publish まで止めてよいか」の判定(純関数)。
 *
 * ★なぜ要るか(2026-08-14 ユーザー実機・会場にギフトが出ない件の真因)
 *
 * ■ 症状
 *   「自分でギフト投げて自分でコメントしてPOPには反映されてるけど会場モードにでてない」
 *   速報: `会場一致 ⚪鏡stale(656s) link7 gift0 ad4 konta0 tanu332`
 *
 * ■ 真因(コードで確定)
 *   ①POP の tick は `document.hidden` なら **早期 return** する
 *   (popup-entry.js の LANE_TICK_REASONS.DOC_HIDDEN)。
 *   会場モードを開くと①POPは隠れる → `renderStoryUserLane` が走らない
 *   → その中で呼ばれる `publishLaneMirror` も走らない
 *   → **鏡が更新されない** → 会場は古い鏡(656秒前=ギフトを投げる前)を描き続ける。
 *
 *   ★「描かない」のは正しい(見えない画面を描くのは無駄)。
 *     間違っていたのは **描画と publish を同じ早期 return に載せていた**こと。
 *     publish は【別の画面(会場)のためのデータ供給】であって、
 *     自分が見えているかとは無関係。
 *   → [[venue-mirror-is-the-primary-path-2026-08-01]]:
 *     会場は①の鏡。①が止まると会場も止まる。
 *
 * ■ 判定(この module の責務)
 *   隠れていても **会場が開いているなら publish は続ける**。
 *   会場も閉じているなら誰も鏡を読まないので、従来どおり全部止めてよい(省電力)。
 *
 * @module hiddenPublishPolicy
 */

/**
 * @param {object} input
 * @param {boolean} input.docHidden `document.hidden`
 * @param {boolean} input.venueOpen 会場モードが開いているか
 * @returns {{ paint: boolean, publish: boolean, reason: string }}
 *   paint=描画してよいか / publish=鏡を書いてよいか
 */
export function decideHiddenWork(input) {
  const hidden = input?.docHidden === true;
  const venueOpen = input?.venueOpen === true;

  if (!hidden) return { paint: true, publish: true, reason: 'visible' };

  if (venueOpen) {
    /*
     * ★ここが根治点。見えていなくても【会場が読む鏡】は書き続ける。
     *   描画は止めたまま=重さは増やさない(paint:false)。
     */
    return { paint: false, publish: true, reason: 'hidden-but-venue-open' };
  }
  return { paint: false, publish: false, reason: 'hidden-and-no-reader' };
}

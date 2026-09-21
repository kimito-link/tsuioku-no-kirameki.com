/**
 * frozenElapsedOnEnd — 終了枠の経過秒を「凍結値があればそれ、無ければライブ値」に決める純関数。
 *
 * 背景(v0.1.1535・46時間問題): status/Web版の経過秒は snapshot.streamAgeMin(=Date.now()-begin)
 *   由来で、配信が終わっても伸び続ける(実機で「配信時間46時間」表示)。content が終了検知した
 *   瞬間の経過秒を nls_live_ended_<lv>.elapsedSecAtEnd に凍結して持つので、終了枠はそれを採用して
 *   止める。凍結値が無い(begin 不明の古い終了枠等)なら従来の live 値へフォールバック=無音で壊れない。
 *
 * ★役割は「どちらを表示に使うか」の判定だけ。凍結値の生成は content-entry、格納は liveEndedFlag。
 *
 * @module frozenElapsedOnEnd
 */

/**
 * @param {{ endedAt?: unknown, elapsedSecAtEnd?: unknown }|null|undefined} endedFlag
 *   nls_live_ended_<lv> の中身(未終了なら null/undefined)。
 * @param {number|null} liveElapsedSec 現在の live 経過秒(streamAgeMin*60 等)。
 * @returns {number|null} 表示に使う経過秒。終了かつ凍結値ありなら凍結値、それ以外は liveElapsedSec。
 */
export function resolveDisplayElapsedSec(endedFlag, liveElapsedSec) {
  const flag = endedFlag && typeof endedFlag === 'object' ? endedFlag : null;
  const endedAt = flag ? Number(flag.endedAt) : 0;
  const isEnded = Number.isFinite(endedAt) && endedAt > 0;
  if (isEnded) {
    // null/undefined は「凍結値なし」= Number(null)===0 の罠を踏まない(古い終了枠は live へ落とす)。
    const raw = flag.elapsedSecAtEnd;
    if (raw != null) {
      const frozen = Number(raw);
      // 0 秒終了(開始直後終了)も有効値として尊重する(>= 0)。
      if (Number.isFinite(frozen) && frozen >= 0) return Math.floor(frozen);
    }
  }
  // 未終了、または凍結値が無い終了枠は従来通り live 値(伸び続けるが壊さない)。
  return liveElapsedSec != null && Number.isFinite(Number(liveElapsedSec))
    ? Math.floor(Number(liveElapsedSec))
    : null;
}

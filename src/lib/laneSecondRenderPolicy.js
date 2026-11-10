// laneSecondRenderPolicy.js — 応援マスの「ギフト/広告の読み込み後の2回目の描画」を省いてよいかの判定(純関数)。
//
// ★v0.1.1987(りんく方針「どんな低スペックPCでも動くように」): 応援マスは1回の描き直しで2回組み立てる
//   (1回目=コメントの人をすぐ出す・2回目=ギフト/広告の列を読み込んでから載せる)。数千人いる配信では
//   1回の組み立てが重く(手元の計測・6,500人・CPU 4倍遅く: 1回 約0.5秒)、ギフト/広告の列が1回目と同じなら
//   2回目は同じものを組み立て直すだけだった。人数が LANE_SECOND_RENDER_SKIP_MIN_PEOPLE 以上で、
//   ギフト/広告の列が読み込みの前後で同じときだけ、2回目を省く。少人数の配信は今までどおり2回描く。

export const LANE_SECOND_RENDER_SKIP_MIN_PEOPLE = 2000;

/** @param {unknown} picks */
function picksSig(picks) {
  if (!Array.isArray(picks)) return '';
  try {
    return JSON.stringify(picks);
  } catch {
    return `!${picks.length}:${Math.random()}`; // 比べられない中身は「違う」として扱う(省かない)
  }
}

/**
 * @param {{ peopleCount: unknown, prevGift: unknown, nextGift: unknown, prevAd: unknown, nextAd: unknown }} input
 * @returns {boolean} true = 2回目の描画を省いてよい
 */
export function shouldSkipLaneSecondRender(input) {
  const n = Number(input?.peopleCount);
  if (!Number.isFinite(n) || n < LANE_SECOND_RENDER_SKIP_MIN_PEOPLE) return false;
  if (!Array.isArray(input?.prevGift) || !Array.isArray(input?.nextGift)) return false;
  if (!Array.isArray(input?.prevAd) || !Array.isArray(input?.nextAd)) return false;
  if (input.prevGift.length !== input.nextGift.length || input.prevAd.length !== input.nextAd.length) return false;
  return picksSig(input.prevGift) === picksSig(input.nextGift) && picksSig(input.prevAd) === picksSig(input.nextAd);
}

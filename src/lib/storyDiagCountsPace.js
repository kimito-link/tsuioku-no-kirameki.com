// storyDiagCountsPace.js — 診断用の数え上げ(顔が付いた件数など)を、大きな記録では毎回やり直さないための判定(純関数)。
//
// ★v0.1.1981 の計測の続き(v0.1.1982): 横の欄は描き直しのたびに、診断用の数字(ID 付きの件数・顔付きの件数・
//   顔の種類の数・解決できた顔の数・自分の投稿の数)を全行なめて数え直していた。画面の主役ではない診断の数字のために、
//   8万行の配信で1回の描き直しの約3割を使っていた(手元の計測・CPU 4倍遅く)。
//   行数が STORY_DIAG_PACE_MIN_ROWS 以上で、同じ配信・同じ行数のあいだは、STORY_DIAG_PACE_MS に1回だけ数え直す。
//   行数が減ったら・2% を超えて増えたらすぐ数え直す(v0.1.1985 で「変わったら」から変更)。小さな記録は今までどおり毎回数える。

export const STORY_DIAG_PACE_MIN_ROWS = 5000;
export const STORY_DIAG_PACE_MS = 60_000;
// ★v0.1.1985: 生放送の途中は行数が毎回増えるので、「同じ行数のあいだ」では一度も使い回せなかった(手元の計測・生放送のまね:
//   数え上げだけで 100秒中 約6秒)。数えたときの行数からこの割合まで増えるあいだは、前の値を使う(減ったらすぐ数え直す)。
export const STORY_DIAG_PACE_GROW_RATIO = 0.02;

/** @returns {{ lv: string, len: number, at: number, reused: number, counted: number }} */
export function createStoryDiagCountsPaceState() {
  return { lv: '', len: -1, at: 0, reused: 0, counted: 0 };
}

/**
 * 今回は前に数えた値をそのまま使ってよいか。使わない(数え直す)ときは state を今回の値で更新する。
 * @param {{ lv: string, len: number, at: number, reused: number, counted: number }} state
 * @param {{ lv: unknown, len: unknown, nowMs: unknown }} input
 * @returns {boolean}
 */
export function shouldReuseStoryDiagCounts(state, input) {
  const lv = String(input?.lv ?? '').trim().toLowerCase();
  const len = Number(input?.len);
  const now = Number(input?.nowMs);
  const ok =
    !!lv &&
    Number.isFinite(len) &&
    Number.isFinite(now) &&
    len >= STORY_DIAG_PACE_MIN_ROWS &&
    state.lv === lv &&
    len >= state.len &&
    len - state.len <= Math.floor(state.len * STORY_DIAG_PACE_GROW_RATIO) &&
    now >= state.at &&
    now - state.at < STORY_DIAG_PACE_MS;
  if (ok) {
    state.reused += 1;
    return true;
  }
  state.lv = lv;
  state.len = Number.isFinite(len) ? len : -1;
  state.at = Number.isFinite(now) ? now : 0;
  state.counted += 1;
  return false;
}

// storyDiagCountsPace.js — 診断用の数え上げ(顔が付いた件数など)を、大きな記録では毎回やり直さないための判定(純関数)。
//
// ★v0.1.1981 の計測の続き(v0.1.1982): 横の欄は描き直しのたびに、診断用の数字(ID 付きの件数・顔付きの件数・
//   顔の種類の数・解決できた顔の数・自分の投稿の数)を全行なめて数え直していた。画面の主役ではない診断の数字のために、
//   8万行の配信で1回の描き直しの約3割を使っていた(手元の計測・CPU 4倍遅く)。
//   行数が STORY_DIAG_PACE_MIN_ROWS 以上で、同じ配信のあいだは、STORY_DIAG_PACE_MS に1回だけ数え直す。
//   行数が増えても、その間隔が来るまでは前の値を使う(減ったらすぐ数え直す)。小さな記録は今までどおり毎回数える。

export const STORY_DIAG_PACE_MIN_ROWS = 5000;
export const STORY_DIAG_PACE_MS = 60_000;
// 行数が増えても、STORY_DIAG_PACE_MS が来るまでは数え直さない。
//   2% ごとに全件を数えていた経路は、4倍・6倍に遅くした条件で 100ms を超える仕事になっていた。
//   これは診断の数字だけで、画面の「記録件数」ではない。減ったときと、1分たったときは今までどおり数え直す。

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

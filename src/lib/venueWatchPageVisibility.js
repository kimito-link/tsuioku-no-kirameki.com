// venueWatchPageVisibility.js — 視聴ページ判定が一瞬でも外れると会場を閉じていたのを防ぐ。
//   Chrome のサイドパネルを開くとタブの幅が狭くなり、ミクチャは狭い画面用の組み直しをする。
//   そのとき URL の読み取りが一瞬空になっても、開いていた会場は閉じない。
//   ホームなど視聴ページ以外へ本当に移ったときだけ、少し待ってから閉じる。
// @layer L0 — 純粋計算
export const VENUE_WATCH_KEY_LOSS_CLOSE_MS = 2500;

/**
 * @param {{ shown: boolean, venueOpen: boolean, missingMs?: number, closeAfterMs?: number }} args
 * @returns {{ hideRoot: boolean, closeVenue: boolean }}
 */
export function venueRootVisibilityAction(args) {
  const shown = args?.shown === true;
  const venueOpen = args?.venueOpen === true;
  const missingMs = Number(args?.missingMs);
  const closeAfterMs = Number.isFinite(Number(args?.closeAfterMs))
    ? Number(args.closeAfterMs)
    : VENUE_WATCH_KEY_LOSS_CLOSE_MS;
  if (shown) return { hideRoot: false, closeVenue: false };
  const goneLongEnough = Number.isFinite(missingMs) && missingMs >= closeAfterMs;
  return { hideRoot: true, closeVenue: venueOpen && goneLongEnough };
}

// venueRevealOfficialComposer.js — 会場モードから公式のコメント欄へ送るとき、公式の欄へ操作を通す。
//   ニコ生・YouTube・Twitch・ツイキャス・SHOWROOM・ミクチャ・Kick・ふわっち・ABEMA・TikTok など、
//   会場の「ここから発言」はどのサービスでもここを通す。
//   ★2026-11-23 りんく実機: 送りの瞬間に会場が閉じたように見えた。原因は nlsb-is-tucked で
//   .nlsb-stage(ヘッダーと「ここから発言」を含む)を visibility:hidden にしていたこと。
//   js の tucked は触らないので、トグルは「🏟 会場モード」のまま出てきて、押すと本当に閉じていた。
//   送りのあいだは会場を消さず、公式の欄へ操作を通す印だけ付ける。前回のしまい残骸は外す。
// @layer L1 — 会場の印を付け外しするだけ

import { VENUE_COMPOSER_PASS_CLASS, VENUE_TUCK_CLASS } from './venueTuckState.js';

/** @type {WeakMap<object, number>} */
const NEST = new WeakMap();

/**
 * 公式の欄へ送るあいだ、会場は開いたままにする。前回の失敗でしまった印が残っていれば外す。
 * 会場が閉じていれば何もしない。
 * @param {Document | null | undefined} [doc]
 * @returns {() => void} 元に戻す関数
 */
export function revealVenueOfficialComposer(doc = typeof document !== 'undefined' ? document : /** @type {any} */ (null)) {
  if (!doc) return () => {};
  const html = doc.documentElement;
  const root = doc.getElementById && doc.getElementById('nlsb-venue-root');
  const open = !!(html && html.classList && html.classList.contains('nlsb-venue-open'));
  if (!open || !root || !root.classList) return () => {};
  const prev = Number(NEST.get(root) || 0);
  NEST.set(root, prev + 1);
  if (prev === 0 && root.classList.contains(VENUE_TUCK_CLASS)) {
    try {
      root.classList.remove(VENUE_TUCK_CLASS);
    } catch {
      /* 残骸が外れなくても送りは続ける */
    }
  }
  root.classList.add(VENUE_COMPOSER_PASS_CLASS);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const left = Number(NEST.get(root) || 1) - 1;
    if (left <= 0) {
      NEST.delete(root);
      try {
        root.classList.remove(VENUE_COMPOSER_PASS_CLASS);
      } catch {
        /* 戻し損なっても送信の本体は止めない */
      }
    } else {
      NEST.set(root, left);
    }
  };
}

/**
 * 公式の欄へ送るあいだ印を付ける。終わったら(失敗しても)必ず外す。会場は消さない。
 * @template T
 * @param {Document | null | undefined} doc
 * @param {() => (T | Promise<T>)} fn
 * @returns {Promise<T>}
 */
export async function withRevealedVenueOfficialComposer(doc, fn) {
  const restore = revealVenueOfficialComposer(doc);
  try {
    return await fn();
  } finally {
    restore();
  }
}

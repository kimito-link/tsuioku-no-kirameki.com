// venuePaintSchedule.js — 会場モードの描画を、どの配信サービスでも同じルールで軽くする。
//   ニコ生・YouTube・Twitch・ツイキャス・SHOWROOM・ミクチャ・Kick・ふわっち・ABEMA・TikTok など、
//   会場(venueBar.js)を使うページはすべてここを通す。低スペックの PC でもスクロールを奪わない。
// @layer L0 — 純関数 / タイマーは呼び出し側が渡す

/**
 * 群衆キャンバスを動かしてよいか。閉じている・しまっている・裏タブ・動きを減らす設定・観客0 では動かない。
 * @param {{ open?: boolean, tucked?: boolean, hidden?: boolean, reducedMotion?: boolean, count?: number }} s
 * @returns {boolean}
 */
export function shouldAnimateVenueCrowd(s = {}) {
  return s.open === true && s.tucked !== true && s.hidden !== true && s.reducedMotion !== true && Number(s.count) > 0;
}

/**
 * 使っていない席の DOM を、この描画で触る必要があるか。
 * 既に外して空なら触らない(毎描画で上限 500 席へ replaceChildren しない)。
 * @param {{ seat?: { parentElement?: Element | null, childNodes?: { length: number } }, tile?: unknown } | null | undefined} node
 * @param {boolean} isVisible
 * @returns {boolean}
 */
export function unusedSeatNeedsCleanup(node, isVisible) {
  if (isVisible) return false;
  if (!node || !node.seat) return false;
  if (node.tile) return true;
  if (node.seat.parentElement) return true;
  const kids = node.seat.childNodes;
  return !!(kids && kids.length > 0);
}

/**
 * 用意する席ノード数。見える席の最大 index+1 を、上限(既定 500)で切る。まだ無い分だけ足す。
 * @param {Iterable<{ seatIndex?: number }>} visibleSeats
 * @param {number} currentCount
 * @param {number} cap
 * @returns {number}
 */
export function requiredSeatNodeCount(visibleSeats, currentCount, cap) {
  const hard = Math.max(0, Math.floor(Number(cap) || 0));
  let maxIdx = -1;
  if (visibleSeats) {
    for (const entry of visibleSeats) {
      const i = Number(entry?.seatIndex);
      if (Number.isFinite(i) && i > maxIdx) maxIdx = i;
    }
  }
  const needed = Math.max(0, maxIdx + 1, Math.max(0, Math.floor(Number(currentCount) || 0)));
  return Math.min(hard, needed);
}

/**
 * 新しい発言者の席がまだ無く、吹き出しの前に同期で席を描く必要があるか。
 * しまったとき・裏タブ・閉じているときは描画しない(読み上げは呼び出し側で別経路)。
 * @param {{ open?: boolean, tucked?: boolean, hidden?: boolean, speakerIds?: Iterable<unknown>, hasSeat?: (uid: string) => boolean }} s
 * @returns {boolean}
 */
export function shouldSyncVenueSeatCommit(s = {}) {
  if (s.open !== true || s.tucked === true || s.hidden === true) return false;
  const hasSeat = typeof s.hasSeat === 'function' ? s.hasSeat : () => false;
  if (!s.speakerIds) return false;
  for (const id of s.speakerIds) {
    const uid = String(id || '').trim();
    if (uid && !hasSeat(uid)) return true;
  }
  return false;
}

/**
 * 席の再描画を 1 本にまとめる。同じフレームに何度来ても 1 回だけ。短すぎる間隔は間引く。
 * しまったとき・裏タブでは保留し、kick() で再開する。
 * @param {{
 *   raf?: (cb: () => void) => number,
 *   caf?: (id: number) => void,
 *   now?: () => number,
 *   isHidden?: () => boolean,
 *   isPaused?: () => boolean,
 *   minIntervalMs?: number
 * }} [opts]
 */
export function createVenuePaintSchedule(opts = {}) {
  const raf =
    opts.raf ||
    (typeof requestAnimationFrame === 'function'
      ? (cb) => requestAnimationFrame(cb)
      : (cb) => setTimeout(cb, 16));
  const caf =
    opts.caf ||
    (typeof cancelAnimationFrame === 'function' ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id));
  const now = opts.now || (() => Date.now());
  const isHidden = opts.isHidden || (() => false);
  const isPaused = opts.isPaused || (() => false);
  const minIntervalMs = Math.max(0, Number(opts.minIntervalMs) || 80);
  let pending = /** @type {null | (() => void)} */ (null);
  let id = 0;
  let lastRun = 0;

  const arm = () => {
    if (id || !pending) return;
    if (isPaused() || isHidden()) return;
    id = raf(flush);
  };

  const flush = () => {
    id = 0;
    if (!pending) return;
    if (isPaused() || isHidden()) return;
    const wait = lastRun + minIntervalMs - now();
    if (wait > 0) {
      id = raf(flush);
      return;
    }
    const fn = pending;
    pending = null;
    lastRun = now();
    fn();
  };

  return {
    /**
     * @param {() => void} fn
     * @returns {'scheduled' | 'coalesced' | 'deferred'}
     */
    schedule(fn) {
      pending = fn;
      if (isPaused() || isHidden()) return 'deferred';
      if (id) return 'coalesced';
      arm();
      return 'scheduled';
    },
    /** しまいや裏タブが終わったあと、保留中の描画を 1 回走らせる */
    kick() {
      arm();
    },
    cancel() {
      if (id) caf(id);
      id = 0;
      pending = null;
    },
  };
}

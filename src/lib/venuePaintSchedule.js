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
 * 見える席に合わせて席ノードを足す。上限を超えて作らない。どのサービスでも同じ。
 * @template T
 * @param {T[]} seatNodes
 * @param {Iterable<{ seatIndex?: number }>} visibleSeats
 * @param {number} cap
 * @param {(index: number) => T} createNode
 * @returns {T[]}
 */
export function growVenueSeatNodes(seatNodes, visibleSeats, cap, createNode) {
  const nodes = seatNodes || [];
  const want = requiredSeatNodeCount(visibleSeats, nodes.length, cap);
  while (nodes.length < want) nodes.push(createNode(nodes.length));
  return nodes;
}

/**
 * ページが裏に回っているか。document は呼び出し側が渡す(この部品は DOM に触らない)。
 * @param {{ visibilityState?: string } | null | undefined} doc
 * @returns {boolean}
 */
export function isVenuePageHidden(doc) {
  return !!(doc && doc.visibilityState !== 'visible');
}

/**
 * 席と吹き出しを描かず、音声だけにするか。裏タブでは待ち行列も貯めない。
 * @param {{ open?: boolean, tucked?: boolean, hidden?: boolean, voiceEnabled?: boolean, readingWanted?: boolean }} s
 * @returns {{ skipSeats: boolean, skipEnqueue: boolean, venueGate: string }}
 */
export function resolveVenueSpeechPaintSkip(s = {}) {
  const hidden = s.hidden === true;
  const tucked = s.tucked === true;
  const open = s.open === true;
  if (open && !tucked && !hidden) return { skipSeats: false, skipEnqueue: false, venueGate: '' };
  let venueGate = 'panel-closed';
  if (open) venueGate = tucked ? (s.voiceEnabled === true ? 'ok' : 'voice-off') : 'headless';
  else if (s.voiceEnabled === true) venueGate = 'headless';
  else if (s.readingWanted === true) venueGate = 'headless-waiting-engine';
  return { skipSeats: true, skipEnqueue: hidden, venueGate };
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

/**
 * 群衆キャンバスの rAF ループ。allowed / draw は呼び出し側が渡す。
 * 約 18fps に間引き、閉じてる・しまっている・裏タブでは start しても走らない。
 * @param {{
 *   raf?: (cb: () => void) => number,
 *   caf?: (id: number) => void,
 *   now?: () => number,
 *   allowed?: () => boolean,
 *   minFrameMs?: number,
 *   draw?: (timeMs: number) => void
 * }} [opts]
 */
export function createVenueCrowdMotion(opts = {}) {
  const raf =
    opts.raf ||
    (typeof requestAnimationFrame === 'function' ? (cb) => requestAnimationFrame(cb) : null);
  const caf =
    opts.caf ||
    (typeof cancelAnimationFrame === 'function' ? (id) => cancelAnimationFrame(id) : null);
  const now = opts.now || (() => Date.now());
  const allowed = opts.allowed || (() => false);
  const minFrameMs = Math.max(0, Number(opts.minFrameMs) || 55);
  const draw = typeof opts.draw === 'function' ? opts.draw : () => {};
  let id = 0;
  let lastDraw = 0;
  const tick = () => {
    id = 0;
    if (!allowed()) return;
    const t = now();
    if (t - lastDraw >= minFrameMs) {
      lastDraw = t;
      draw(t);
    }
    if (raf) id = raf(tick);
  };
  return {
    start() {
      if (id || !allowed() || !raf) return false;
      lastDraw = now() - minFrameMs;
      id = raf(tick);
      return true;
    },
    stop() {
      if (id && caf) caf(id);
      id = 0;
    },
  };
}

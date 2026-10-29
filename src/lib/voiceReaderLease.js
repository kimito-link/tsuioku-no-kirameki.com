// voiceReaderLease.js — 同じ配信を会場とコメビュの両方で開いた時、読み上げるのは片方だけにする(v0.1.1794)。
//   これまでは両方が同じコメントを読み、声が二重に鳴るうえ VOICEVOX を取り合って遅れた
//   (PC 試験: コメビュも読んでいると会場の声まで 3.9〜5.7秒・片方だけなら 2.9秒)。
//   Background(service worker)が配信(liveId)ごとに「いま読んでいるページ」を1つ持つ。先に名乗った方が読み、
//   そのページが閉じる・読み上げを切ると(合図が VOICE_READER_LEASE_TTL_MS 途切れると)もう片方が引き継ぐ。
//   ★Background が落ちていたり返事が無ければ「読んでよい」扱い(声が全部止まるより二重の方がまし)。

/** 名乗りが途切れてから、もう片方が引き継ぐまで(ms)。合図は VOICE_READER_LEASE_BEAT_MS ごと。 */
export const VOICE_READER_LEASE_TTL_MS = 6000;
export const VOICE_READER_LEASE_BEAT_MS = 2000;
/** 返事を待つ上限(ms)。 */
export const VOICE_READER_LEASE_QUERY_TIMEOUT_MS = 500;
export const VOICE_READER_CLAIM = 'NLS_VOICE_READER_CLAIM';
export const VOICE_READER_RELEASE = 'NLS_VOICE_READER_RELEASE';

/**
 * Background 側の表(配信ごとに読み手1つ)。background.js が同じ規則を持つ(SW はモジュールを読まないため)。
 * @param {{ ttlMs?: number }} [opts]
 */
export function createVoiceReaderLeaseTable(opts = {}) {
  const ttl = Number(opts.ttlMs) > 0 ? Number(opts.ttlMs) : VOICE_READER_LEASE_TTL_MS;
  /** @type {Map<string, { holder: string, at: number }>} */
  const byLive = new Map();
  return {
    /**
     * @param {unknown} liveId
     * @param {unknown} holder
     * @param {number} now
     * @returns {{ granted: boolean }}
     */
    claim(liveId, holder, now) {
      const lv = String(liveId || '').trim().toLowerCase();
      const h = String(holder || '');
      if (!lv || !h) return { granted: true };
      const cur = byLive.get(lv);
      if (!cur || cur.holder === h || now - cur.at > ttl) {
        byLive.set(lv, { holder: h, at: now });
        return { granted: true };
      }
      return { granted: false };
    },
    /** @param {unknown} holder */
    release(holder) {
      const h = String(holder || '');
      for (const [lv, cur] of byLive) if (cur.holder === h) byLive.delete(lv);
    }
  };
}

/**
 * ページ側の口。check(liveId) で「読んでよいか」を答える。
 *   直近の名乗りの答えが新しければそれを即座に返し、無い・古い時は名乗りの返事を待ってから答える
 *   (v0.1.1794 の初版は答えが無い時に「読む」としていて、コメビュを開いた直後・会場を開き直した直後の
 *   最初の数件が二重に読まれた=PC 試験)。返事が来ない・壊れている時は「読む」。
 * @param {(msg: Record<string, unknown>) => (Promise<unknown> | unknown)} sendMessage
 * @param {{ now?: () => number, holder?: string }} [opts]
 */
export function createVoiceReaderLeaseLink(sendMessage, opts = {}) {
  const now = opts.now || (() => Date.now());
  const holder = opts.holder || `r${Math.random().toString(36).slice(2, 10)}${now().toString(36)}`;
  let lastLive = '';
  let lastGranted = true;
  let lastAnswerAt = -Infinity;
  let lastSentAt = -Infinity;
  /** @type {Promise<void> | null} */
  let inflight = null;
  /** @param {string} lv */
  const claim = (lv) => {
    if (!inflight) inflight = claimOnce(lv).finally(() => { inflight = null; });
    return inflight;
  };
  /** @param {string} lv */
  const claimOnce = async (lv) => {
    lastSentAt = now();
    /** @type {unknown} */
    let timer = null;
    try {
      const res = await Promise.race([
        Promise.resolve(sendMessage({ type: VOICE_READER_CLAIM, liveId: lv, holder })),
        new Promise((r) => { timer = setTimeout(() => r(null), VOICE_READER_LEASE_QUERY_TIMEOUT_MS); })
      ]);
      const granted = res && typeof res === 'object' ? /** @type {any} */ (res).granted : undefined;
      if (lv !== lastLive) return;
      // 形が違う・返事が無い時は「読んでよい」(止めっぱなしにしない)。
      lastGranted = granted !== false;
      lastAnswerAt = now();
    } catch {
      if (lv === lastLive) { lastGranted = true; lastAnswerAt = now(); }
    } finally {
      if (timer !== null) clearTimeout(/** @type {any} */ (timer));
    }
  };
  /** @param {unknown} liveId */
  const norm = (liveId) => String(liveId || '').trim().toLowerCase();
  /** @type {Promise<unknown>} */
  let chain = Promise.resolve();
  const link = {
    holder,
    /** 読んでいる間の合図(定期的に呼ぶ)。 */
    beat(/** @type {unknown} */ liveId) {
      const lv = norm(liveId);
      if (!lv) return Promise.resolve();
      if (lv !== lastLive) { lastLive = lv; lastGranted = true; lastAnswerAt = -Infinity; }
      return claim(lv);
    },
    /**
     * 読んでよいか(届いた順に答える)。
     * @param {unknown} liveId
     * @returns {Promise<boolean>}
     */
    async check(liveId) {
      const lv = norm(liveId);
      if (!lv) return true;
      if (lv !== lastLive) { lastLive = lv; lastGranted = true; lastAnswerAt = -Infinity; }
      const isFresh = () => now() - lastAnswerAt <= VOICE_READER_LEASE_TTL_MS;
      if (!isFresh()) await claim(lv);
      else if (now() - lastSentAt >= VOICE_READER_LEASE_BEAT_MS / 2) void claim(lv);
      return !isFresh() || lastGranted;
    },
    /**
     * 読んでよければ onMine、もう片方が読んでいれば onYield を呼ぶ(届いた順を崩さない)。
     * @param {unknown} liveId
     * @param {() => unknown} onMine
     * @param {() => unknown} [onYield]
     */
    whenMine(liveId, onMine, onYield) {
      chain = chain
        .then(() => link.check(liveId))
        .then((ok) => (ok ? onMine() : onYield?.()))
        .catch(() => {});
      return chain;
    },
    /** もう読まない(窓を閉じる・読み上げを切った)。 */
    release() {
      lastGranted = true;
      lastAnswerAt = -Infinity;
      try {
        const r = sendMessage({ type: VOICE_READER_RELEASE, holder });
        if (r && typeof (/** @type {any} */ (r).catch) === 'function') /** @type {Promise<unknown>} */ (r).catch(() => {});
      } catch { /* no-op */ }
    }
  };
  return link;
}

/**
 * 拡張の中(会場の content script・コメビュ)で使う口。chrome が無ければ null(=いつも読む)。
 * @returns {ReturnType<typeof createVoiceReaderLeaseLink> | null}
 */
export function chromeVoiceReaderLeaseLink() {
  const rt = typeof chrome !== 'undefined' ? chrome.runtime : undefined;
  if (!rt || typeof rt.sendMessage !== 'function') return null;
  return createVoiceReaderLeaseLink((msg) => rt.sendMessage(msg));
}

/**
 * 合図を定期的に送り、読まなくなったら手放す(会場・コメビュの配線を1行にするため)。chrome が無ければ null。
 * @param {() => boolean} isActive 読み上げ中か(会場なら「開いていて ON」)
 * @param {() => unknown} liveId
 * @param {{ link?: ReturnType<typeof createVoiceReaderLeaseLink> | null, onPageHide?: (fn: () => void) => void }} [opts]
 *   onPageHide: ページを閉じる時に呼ぶ口(呼び出し側が window の pagehide を渡す・lib は I/O を持たない)
 * @returns {ReturnType<typeof createVoiceReaderLeaseLink> | null}
 */
export function startVoiceReaderLease(isActive, liveId, opts = {}) {
  const link = opts.link !== undefined ? opts.link : chromeVoiceReaderLeaseLink();
  if (!link) return null;
  let beating = false;
  setInterval(() => {
    if (isActive()) {
      void link.beat(liveId());
      beating = true;
    } else if (beating) {
      link.release();
      beating = false;
    }
  }, VOICE_READER_LEASE_BEAT_MS);
  if (typeof opts.onPageHide === 'function') opts.onPageHide(() => link.release());
  return link;
}

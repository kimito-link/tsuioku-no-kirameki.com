// voiceEngineActivity.js — 会場とコメビュで「VOICEVOX がいま使われているか」を分け合う(v0.1.1781)。
//   VOICEVOX は1本の列で順番に処理するので、片方が声の裏読み込み(モデル読み込み・CPU で数秒)を始めると、
//   もう片方が読んでいる最中のコメントがその後ろで待つ(PC 試験: グラボ無しで ON 直後に 10件中2〜6件しか読めない)。
//   Background(service worker)に「最後に使った時刻」を1つ持たせ、裏読み込みの前に「静かになって何 ms か」を聞く。
//   Background が落ちていたり返事が無ければ「静か」とみなす(読み込みを止めっぱなしにしない)。

/** 合成や読み込みの合図を Background に送る最短間隔(ms)。 */
export const VOICE_ENGINE_PING_MIN_INTERVAL_MS = 500;

/** 「静かになって何 ms か」の返事を待つ上限(ms)。 */
export const VOICE_ENGINE_QUIET_QUERY_TIMEOUT_MS = 500;

/**
 * @param {(msg: { type: string }) => (Promise<unknown> | unknown)} sendMessage chrome.runtime.sendMessage 相当
 * @param {{ now?: () => number }} [opts]
 */
export function createVoiceEngineActivityLink(sendMessage, opts = {}) {
  const now = opts.now || (() => Date.now());
  let lastPingAt = -Infinity;
  return {
    /** 合成・読み込みを始めた/終えた合図(間引いて送る・失敗は無視)。 */
    ping() {
      const t = now();
      if (t - lastPingAt < VOICE_ENGINE_PING_MIN_INTERVAL_MS) return;
      lastPingAt = t;
      try {
        const r = sendMessage({ type: 'NLS_VOICE_ENGINE_ACTIVITY' });
        if (r && typeof (/** @type {any} */ (r).catch) === 'function') /** @type {Promise<unknown>} */ (r).catch(() => {});
      } catch { /* 拡張の更新直後などで送れなくても読み上げは続ける */ }
    },
    /**
     * どちらかのページが最後に VOICEVOX を使ってから何 ms たったか。分からなければ Infinity。
     * @returns {Promise<number>}
     */
    async quietMs() {
      /** @type {unknown} */
      let timer = null;
      try {
        const res = await Promise.race([
          Promise.resolve(sendMessage({ type: 'NLS_VOICE_ENGINE_QUIET' })),
          new Promise((r) => { timer = setTimeout(() => r(null), VOICE_ENGINE_QUIET_QUERY_TIMEOUT_MS); })
        ]);
        const raw = res && typeof res === 'object' ? /** @type {any} */ (res).quietMs : undefined;
        // 返事が来ない(null)・形が違う時は「静か」扱い(Number(null)=0 を「使用中」と取り違えない)。
        return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : Infinity;
      } catch {
        return Infinity;
      } finally {
        if (timer !== null) clearTimeout(/** @type {any} */ (timer));
      }
    }
  };
}

/**
 * 拡張の中(会場の content script・コメビュの拡張ページ)で使う口。chrome が無ければ null。
 * @returns {ReturnType<typeof createVoiceEngineActivityLink> | null}
 */
export function chromeVoiceEngineLink() {
  const rt = typeof chrome !== 'undefined' ? chrome.runtime : undefined;
  if (!rt || typeof rt.sendMessage !== 'function') return null;
  return createVoiceEngineActivityLink((msg) => rt.sendMessage(msg));
}

// voiceWarmup.js — VOICEVOX の声を使う前に温めておく(2026-10-26・VOICEVOX 0.26 の計測から)。
//   DOM も chrome API も触らない(通信は voicevoxClient に任せる)。会場(VoicePlayer)とコメビュの両方がこの1つを使う。
//
// ■ なぜ要るか(りんくの PC で実測・エンジン 0.26.0)
//   - 初めて使う声は、audio_query の中でモデルの読み込みが走り 3.7秒かかった。拡張の audio_query の
//     打ち切りは 3秒なので、その声の最初のコメントは時間切れで捨てられていた疑いがある
//     (= 新しく来た人の最初のコメントが黙って読まれない)。
//   - /initialize_speaker で先に読み込めば 3.5秒、そのあとの合成は普段どおり。
//   - エンジン起動直後の最初の audio_query は辞書の準備で 2.3秒かかった。
// ■ やること
//   - 合成の前に、まだ温まっていない声だけ /initialize_speaker を呼んで待つ(読み込みは1本の列で順番に)。
//   - 読み上げ ON の直後に、捨てる audio_query を1回投げる(primeEngine)。
//   - audio_query の打ち切りを 3秒→8秒に延ばす。エンジンは1件ずつしか処理しないので、合成を
//     頼んだ後に別の声の読み込みが割り込むと、その後ろで待つ(PC 実測: 打ち切り後に始まった読み込み
//     でも時間切れが出た)。古くなったコメントは8秒の鮮度ゲートが別に捨てる。
//   - 読み込みにかかった時間は onTiming の initMs で返す。計器(voiceStageTiming)は合成の時間から
//     これを引く=速いPCが「初めての声が遅い=弱いPC」と誤って記録されないように。

import { initializeVoicevoxSpeaker, warmupVoicevoxQuery } from './voicevoxClient.js';

/** 温めを通す合成の audio_query の打ち切り(ms)。voicevoxClient だけで使うときは 3秒のまま。 */
export const VOICE_WARMUP_QUERY_TIMEOUT_MS = 8000;

/**
 * @param {{
 *   initSpeaker: (styleId: number) => Promise<unknown>,
 *   warmQuery?: (styleId: number) => Promise<unknown>,
 *   now?: () => number
 * }} deps
 */
export function createVoiceWarmup(deps) {
  const now = typeof deps?.now === 'function' ? deps.now : () => Date.now();
  /** @type {Set<string>} */
  const warm = new Set();
  /** @type {Map<string, Promise<boolean>>} */
  const inflight = new Map();
  /** 読み込みに失敗した声(この ON の間は頼み直さない=エンジンが落ちている間に毎回待たせない)。 */
  /** @type {Set<string>} */
  const failed = new Set();
  /** エンジンへの読み込みを1本にする列。 */
  /** @type {Promise<unknown>} */
  let chain = Promise.resolve();
  let pending = 0;
  let epoch = 0;
  let engineWarmed = false;

  /**
   * @template T
   * @param {() => Promise<T>} task
   * @returns {Promise<T>}
   */
  function enqueue(task) {
    pending += 1;
    const p = chain.then(task, task);
    chain = p.then(() => {}, () => {});
    return p.finally(() => { pending -= 1; });
  }

  /** @param {unknown} styleId */
  const keyOf = (styleId) => String(Number(styleId));

  return {
    /** @param {unknown} styleId */
    isWarm(styleId) {
      return warm.has(keyOf(styleId));
    },
    /** 合成に成功した声は温まっている。 @param {unknown} styleId */
    markWarm(styleId) {
      const id = Number(styleId);
      if (Number.isInteger(id) && id >= 0) warm.add(keyOf(id));
    },
    /** 列で読み込みを待っている・実行中のものがあるか。 */
    busy() {
      return pending > 0;
    },
    /**
     * まだ温まっていない声を読み込む(列で順番に)。同じ声を同時に頼まれたら1回にまとめる。
     * @param {unknown} styleId
     * @returns {Promise<boolean>} 読み込めたら true(すでに温まっていても true)
     */
    ensure(styleId) {
      const id = Number(styleId);
      if (!Number.isInteger(id) || id < 0) return Promise.resolve(false);
      const key = keyOf(id);
      if (warm.has(key)) return Promise.resolve(true);
      if (failed.has(key)) return Promise.resolve(false);
      const existing = inflight.get(key);
      if (existing) return existing;
      const myEpoch = epoch;
      const p = enqueue(async () => {
        if (myEpoch !== epoch) return false;
        if (warm.has(key)) return true;
        let ok = false;
        try { ok = !!(await deps.initSpeaker(id)); } catch { ok = false; }
        if (myEpoch === epoch) (ok ? warm : failed).add(key);
        return ok;
      }).finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
      inflight.set(key, p);
      return p;
    },
    /**
     * 読み上げ ON の直後に1回だけ、捨てる audio_query でエンジンを起こす(待たない呼び方でよい)。
     * @param {unknown} styleId
     * @returns {Promise<boolean>}
     */
    primeEngine(styleId) {
      const id = Number(styleId);
      if (engineWarmed || typeof deps.warmQuery !== 'function' || !Number.isInteger(id) || id < 0) {
        return Promise.resolve(false);
      }
      engineWarmed = true;
      const myEpoch = epoch;
      const warmQuery = deps.warmQuery;
      return enqueue(async () => {
        if (myEpoch !== epoch) return false;
        let ok = false;
        try { ok = !!(await warmQuery(id)); } catch { ok = false; }
        if (ok && myEpoch === epoch) warm.add(keyOf(id));
        return ok;
      });
    },
    /** 読み上げ ON のたびに呼ぶ(エンジンが再起動していても温まった扱いにしない)。 */
    reset() {
      epoch += 1;
      warm.clear();
      failed.clear();
      inflight.clear();
      engineWarmed = false;
    },
    now
  };
}

/** 会場・コメビュ共通: 本物の VOICEVOX につないだ warmup。読み込みの打ち切りは 15秒(実測 3.5秒)。 */
export function createVoicevoxWarmup() {
  return createVoiceWarmup({
    initSpeaker: (id) => initializeVoicevoxSpeaker(id, { timeoutMs: 15000 }),
    warmQuery: (id) => warmupVoicevoxQuery(id)
  });
}

/**
 * 合成関数(voicevoxClient.synthesizeVoice と同じ形)を包み、合成の前に声を温める。
 *   呼び出しは同期で始まる(合成の起動を enqueue 直後に固定している既存の約束 v0.1.800 を崩さない)。
 * @template {(text: string, voice: any, opts?: any) => Promise<any>} F
 * @param {ReturnType<typeof createVoiceWarmup>|null|undefined} warmup
 * @param {F} synth
 * @returns {(text: string, voice: any, opts?: any) => Promise<any>}
 */
export function withVoiceWarmup(warmup, synth) {
  if (!warmup) return synth;
  return async (text, voice, opts = {}) => {
    const raw = Number(voice?.styleId);
    const styleId = Number.isFinite(raw) ? raw : 3;
    const startAt = warmup.now();
    let ready = warmup.isWarm(styleId);
    if (!ready) {
      try { ready = await warmup.ensure(styleId); } catch { ready = false; }
    }
    const initMs = Math.max(0, warmup.now() - startAt);
    const busyAtStart = warmup.busy();
    const onTiming = opts?.onTiming;
    const wav = await synth(text, voice, {
      ...opts,
      audioQueryTimeoutMs: Math.max(Number(opts?.audioQueryTimeoutMs) || 0, VOICE_WARMUP_QUERY_TIMEOUT_MS),
      onTiming: (/** @type {any} */ t) => {
        // contended: 別の声の準備と重なった=エンジンを取り合った回。弱い PC の判定に使わない。
        if (typeof onTiming === 'function') onTiming({ ...(t || {}), initMs, contended: busyAtStart || warmup.busy() });
      }
    });
    if (wav) warmup.markWarm(styleId);
    return wav;
  };
}

/**
 * 読み上げ ON のたびに呼ぶ。温まった記録を消して、捨てる audio_query を1回だけ投げる(待たない)。
 *   起こす声は、絞り込みの固定表の先頭(3=ずんだもん)がエンジンにあればそれ、無ければ先頭の声。
 * @param {ReturnType<typeof createVoiceWarmup>|null|undefined} warmup
 * @param {readonly number[]} allStyleIds
 */
export function startVoiceWarmup(warmup, allStyleIds) {
  if (!warmup) return;
  const ids = Array.isArray(allStyleIds) ? allStyleIds.map(Number) : [];
  warmup.reset();
  const first = ids.includes(3) ? 3 : ids[0];
  if (first === undefined) return;
  void warmup.primeEngine(first).catch(() => { /* 起こせなくても読み上げは続ける */ });
}

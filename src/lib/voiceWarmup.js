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
// ■ 2026-10-26 v0.1.1772(計器 v0.1.1771 の試験で分かったこと)
//   新しい人ごとに声を読み込んで待つと、グラボ有りでも声が出るまで 6〜7秒、会場では読み込みが
//   列に積もって 37秒・10件中1〜2件しか読めなかった。読み込み中はエンジンが他の合成もできない。
//   - まだ温まっていない声は【待たない】。温まっている声を借りて今すぐ読み(borrowed)、
//     その人の声は「合成が1件も走っていない時」に1つずつ裏で読み込む(ensureWhenIdle)。
//     読み込めた後のコメントからは本来の声になる。何も温まっていない時(ON の直後)だけ今までどおり待つ。
//   - 少しずつ受け取っている声(ストリーミング)が届き終わるまで、次の合成を始めない。
//     先読みの合成がエンジンを取り合うと、鳴っている声の続きが間に合わず途切れた(0.8秒×1回)。

import { initializeVoicevoxSpeaker, warmupVoicevoxQuery } from './voicevoxClient.js';
import { VOICE_NARROW_STYLE_IDS } from './voiceNarrowing.js';
import { isStreamedVoice, rememberVoiceStylePeak } from './voiceStream.js';
import { measureVoiceWavLevel } from './voiceVolume.js';

/**
 * 合成も再生も止まってから、裏の読み込みを始めるまで待つ時間(ms)。
 *   v0.1.1777: 400ms だと、声を鳴らしている間や次のコメントが来る直前に読み込みが始まり、
 *   次の audio_query がその後ろで 0.5〜0.9秒待った(PC 試験: 先に試したコメビュだけ遅く見えた)。
 */
export const VOICE_IDLE_INIT_DELAY_MS = 1500;

/** 少しずつ受け取っている声を、次の合成が待つ上限(ms)。 */
export const VOICE_STREAM_GATE_MAX_MS = 8000;

/** 温めを通す合成の audio_query の打ち切り(ms)。voicevoxClient だけで使うときは 3秒のまま。 */
export const VOICE_WARMUP_QUERY_TIMEOUT_MS = 8000;

/**
 * @param {{
 *   initSpeaker: (styleId: number) => Promise<unknown>,
 *   warmQuery?: (styleId: number) => Promise<unknown>,
 *   now?: () => number,
 *   setTimeout?: (fn: () => void, ms: number) => unknown,
 *   clearTimeout?: (h: unknown) => void
 * }} deps
 */
export function createVoiceWarmup(deps) {
  const now = typeof deps?.now === 'function' ? deps.now : () => Date.now();
  const setT = typeof deps?.setTimeout === 'function' ? deps.setTimeout : (/** @type {() => void} */ fn, /** @type {number} */ ms) => setTimeout(fn, ms);
  const clearT = typeof deps?.clearTimeout === 'function' ? deps.clearTimeout : (/** @type {any} */ h) => clearTimeout(h);
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
  /** @type {Promise<boolean>|null} */
  let primePromise = null;
  /** 手が空いた時に読み込む声(頼まれた順)。 */
  /** @type {Set<string>} */
  const later = new Set();
  /** @type {Map<string, ((ok: boolean) => void)[]>} */
  const waiters = new Map();
  /** 走っている合成の数(少しずつ受け取り中も届き終わるまで数える)。 */
  let active = 0;
  /** @type {unknown} */
  let pumpTimer = null;
  /** 最後に合成を始めた・終えた時刻。 */
  let lastActivityAt = -Infinity;
  /** @type {{ isIdle?: () => boolean, onInit?: (ms: number, background: boolean) => void }} */
  let hooks = {};
  /** 少しずつ受け取り中の声が届き終わるのを待つ約束(無ければ null)。 */
  /** @type {Promise<unknown>|null} */
  let streamGate = null;

  /** @param {string} key @param {boolean} ok */
  function settle(key, ok) {
    later.delete(key);
    const list = waiters.get(key);
    if (!list) return;
    waiters.delete(key);
    for (const fn of list) fn(ok);
  }

  /**
   * 少しずつ受け取り中の声が届き終わるまで待つ(上限 VOICE_STREAM_GATE_MAX_MS)。
   * @param {Promise<unknown>} gate
   * @returns {Promise<void>}
   */
  function waitGate(gate) {
    /** @type {unknown} */
    let timer = null;
    return Promise.race([
      gate.then(() => {}, () => {}),
      new Promise((r) => { timer = setT(() => r(undefined), VOICE_STREAM_GATE_MAX_MS); })
    ]).then(() => { if (timer !== null) clearT(timer); });
  }

  /** 合成が走っていなければ、裏の読み込みを1つ始める。 */
  function pump() {
    if (pumpTimer !== null || later.size === 0) return;
    pumpTimer = setT(() => {
      pumpTimer = null;
      if (later.size === 0) return;
      let playerIdle = true;
      try { playerIdle = typeof hooks.isIdle === 'function' ? hooks.isIdle() !== false : true; } catch { playerIdle = true; }
      // 合成・再生・読む順番待ちのどれかがある、または動きが止まって間もない時は、少し後でもう一度見る。
      if (active > 0 || pending > 0 || !playerIdle || now() - lastActivityAt < VOICE_IDLE_INIT_DELAY_MS) {
        pump();
        return;
      }
      const key = /** @type {string} */ (later.values().next().value);
      later.delete(key);
      void ensureInternal(Number(key), true).then(() => {}, () => {});
    }, VOICE_IDLE_INIT_DELAY_MS);
  }

  /**
   * @template T
   * @param {() => Promise<T>} task
   * @returns {Promise<T>}
   */
  function enqueue(task) {
    pending += 1;
    const p = chain.then(task, task);
    chain = p.then(() => {}, () => {});
    return p.finally(() => { pending -= 1; pump(); });
  }

  /** @param {unknown} styleId */
  const keyOf = (styleId) => String(Number(styleId));

  /**
   * @param {unknown} styleId
   * @param {boolean} background 合成の合間に裏で読み込んだか
   * @returns {Promise<boolean>}
   */
  function ensureInternal(styleId, background) {
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
      const t0 = now();
      try { ok = !!(await deps.initSpeaker(id)); } catch { ok = false; }
      try { if (typeof hooks.onInit === 'function') hooks.onInit(Math.max(0, now() - t0), background); } catch { /* 計器は本体を止めない */ }
      if (myEpoch === epoch) (ok ? warm : failed).add(key);
      return ok;
    }).then((ok) => { if (myEpoch === epoch) settle(key, ok); return ok; })
      .finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
    inflight.set(key, p);
    return p;
  }

  const api = {
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
      return ensureInternal(styleId, false);
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
      const p = enqueue(async () => {
        if (myEpoch !== epoch) return false;
        let ok = false;
        try { ok = !!(await warmQuery(id)); } catch { ok = false; }
        if (ok && myEpoch === epoch) warm.add(keyOf(id));
        return ok;
      });
      primePromise = p;
      return p;
    },
    /** エンジンを起こしている最中なら、その約束(無ければ null)。 */
    priming() {
      return primePromise;
    },
    /**
     * 合成が1件も走っていない時に、裏で1つずつ読み込む(待たせない読み込み)。
     * @param {unknown} styleId
     * @returns {Promise<boolean>} 読み込めたら true
     */
    ensureWhenIdle(styleId) {
      const id = Number(styleId);
      if (!Number.isInteger(id) || id < 0) return Promise.resolve(false);
      const key = keyOf(id);
      if (warm.has(key)) return Promise.resolve(true);
      if (failed.has(key)) return Promise.resolve(false);
      const existing = inflight.get(key);
      if (existing) return existing;
      later.add(key);
      const p = new Promise((resolve) => {
        const list = waiters.get(key) || [];
        list.push(resolve);
        waiters.set(key, list);
      });
      pump();
      return /** @type {Promise<boolean>} */ (p);
    },
    /**
     * まだ温まっていない声の代わりに今すぐ読む声。温まった声が無ければ null。
     *   決まった順(絞り込みの固定表→番号順)に並べ、頼まれた声の番号で選ぶ=同じ状態なら同じ声。
     * @param {unknown} styleId
     * @returns {number|null}
     */
    borrowFor(styleId) {
      const ids = [...warm].map(Number);
      if (!ids.length) return null;
      const inPalette = VOICE_NARROW_STYLE_IDS.filter((x) => ids.includes(x));
      const rest = ids.filter((x) => !VOICE_NARROW_STYLE_IDS.includes(x)).sort((a, b) => a - b);
      const order = [...inPalette, ...rest];
      const n = Math.abs(Math.floor(Number(styleId))) || 0;
      return order[n % order.length];
    },
    /**
     * 合成を始める前に呼ぶ。少しずつ受け取り中の声があれば、届き終わるまで(上限つきで)待つ約束を返す。
     *   無ければ null(=待たずに同期で合成を始められる)。
     * @returns {Promise<void>|null}
     */
    beforeSynth() {
      active += 1;
      lastActivityAt = now();
      const gate = streamGate;
      if (!gate) return null;
      return waitGate(gate);
    },
    /**
     * 少しずつ受け取る合成を【頼む時点】で門を閉じる(v0.1.1773)。返事を待つ間に並んで始まった先読みが
     *   エンジンを取り合い、鳴り始めた声の続きが間に合わなかった(グラボ無し・一気に10件で 1.1秒の無音)。
     * @returns {(result: unknown) => void} 合成の結果を渡すと、届き終わった時に門を開ける
     */
    closeStreamGate() {
      /** @type {(v?: unknown) => void} */
      let open = () => {};
      const g = new Promise((r) => { open = r; });
      streamGate = g;
      return (result) => {
        const release = () => { if (streamGate === g) streamGate = null; open(); };
        if (isStreamedVoice(result)) void result.whenDone.then(release, release);
        else release();
      };
    },

    /**
     * 再生側の様子と計器をつなぐ(v0.1.1777)。isIdle: 再生も順番待ちも無い時 true。
     *   onInit: 声を読み込んだ時間(ms)と、裏の読み込みだったか。
     * @param {{ isIdle?: () => boolean, onInit?: (ms: number, background: boolean) => void }} h
     */
    setHooks(h) {
      hooks = h && typeof h === 'object' ? h : {};
    },
    /** 走っている合成の数(少しずつ受け取り中も含む)。 */
    activeCount() {
      return active;
    },
    /**
     * 合成が終わったら呼ぶ。少しずつ受け取った声は、届き終わってから「終わった」にする。
     * @param {unknown} result
     */
    afterSynth(result) {
      const done = () => { active = Math.max(0, active - 1); lastActivityAt = now(); pump(); };
      if (isStreamedVoice(result)) {
        void result.whenDone.then(done, done);
        return;
      }
      done();
    },
    /** 読み上げ ON のたびに呼ぶ(エンジンが再起動していても温まった扱いにしない)。 */
    reset() {
      epoch += 1;
      warm.clear();
      failed.clear();
      inflight.clear();
      engineWarmed = false;
      primePromise = null;
      if (pumpTimer !== null) { clearT(pumpTimer); pumpTimer = null; }
      for (const key of [...waiters.keys()]) settle(key, false);
      later.clear();
    },
    now
  };
  return api;
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
    let useStyle = styleId;
    let borrowed = false;
    if (!warmup.isWarm(styleId)) {
      // 起こしている最中なら、それを待ってから借りる(ON の直後の1件目)。
      const priming = warmup.priming();
      if (priming && warmup.borrowFor(styleId) === null) {
        try { await priming; } catch { /* 起こせなくても続ける */ }
      }
      const sub = warmup.borrowFor(styleId);
      if (sub !== null && sub !== styleId) {
        useStyle = sub;
        borrowed = true;
        void warmup.ensureWhenIdle(styleId);
      } else if (sub === null) {
        // 温まった声が1つも無い時だけ、今までどおり読み込んでから読む。
        try { await warmup.ensure(styleId); } catch { /* 読み込めなくても合成は試す */ }
      }
    }
    const initMs = Math.max(0, warmup.now() - startAt);
    // v0.1.1775: 他の合成がまだエンジンで走っている時は、少しずつ受け取らず丸ごと作る
    //   (先に始まった合成とエンジンを取り合い、鳴っている声の続きが間に合わなかった・グラボ無しのコメビュ)。
    const streamOk = opts?.stream === true && warmup.activeCount() === 0 && !warmup.busy();
    /** @type {any} */
    const callOpts = { ...opts };
    if (!streamOk) delete callOpts.stream;
    const gate = warmup.beforeSynth();
    if (gate) await gate;
    // 少しずつ受け取る合成は、頼んだ時点で次の合成を待たせる(届き終わるまで)。
    const releaseStream = streamOk ? warmup.closeStreamGate() : null;
    const busyAtStart = warmup.busy();
    const onTiming = opts?.onTiming;
    /** @type {any} */
    let wav = null;
    try {
      wav = await synth(text, borrowed ? { ...voice, styleId: useStyle } : voice, {
        ...callOpts,
        audioQueryTimeoutMs: Math.max(Number(opts?.audioQueryTimeoutMs) || 0, VOICE_WARMUP_QUERY_TIMEOUT_MS),
        onTiming: (/** @type {any} */ t) => {
          // contended: 別の声の準備と重なった=エンジンを取り合った回。弱い PC の判定に使わない。
          // borrowed: 温まっていない声の代わりに、温まった声で読んだ。
          if (typeof onTiming === 'function') onTiming({ ...(t || {}), initMs, contended: busyAtStart || warmup.busy(), borrowed });
        }
      });
    } finally {
      warmup.afterSynth(wav);
      if (releaseStream) releaseStream(wav);
    }
    if (wav) warmup.markWarm(useStyle);
    // v0.1.1775: 声ごとの素の大きさを覚える(次に少しずつ読む時の最初の倍率に使う)。
    try {
      if (isStreamedVoice(wav)) {
        wav.styleId = useStyle;
        const sv = wav;
        void sv.whenDone.then((ok) => { if (ok) rememberVoiceStylePeak(useStyle, sv.peak); }, () => {});
      } else if (wav instanceof ArrayBuffer) {
        const level = measureVoiceWavLevel(wav);
        if (level) rememberVoiceStylePeak(useStyle, level.peak);
      }
    } catch { /* 計器・補助は本体を止めない */ }
    return wav;
  };
}

/**
 * 読み上げ ON のたびに呼ぶ。温まった記録を消して、捨てる audio_query を1回だけ投げる(待たない)。
 *   そのあと固定表の声を、合成が走っていない時に1つずつ裏で読み込む(借りられる声を増やす)。
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
  // v0.1.1772: 借りられる声を増やすため、固定表の声を手が空いた時に裏で読み込む(どの PC でも・待たない)。
  for (const id of VOICE_NARROW_STYLE_IDS) {
    if (id !== first && ids.includes(id)) void warmup.ensureWhenIdle(id);
  }
}

/**
 * v0.1.1777: 再生の様子(読む順番待ち・再生中)と計器を warmup につなぐ(会場・コメビュ共通)。
 * @param {ReturnType<typeof createVoiceWarmup>|null|undefined} warmup
 * @param {() => boolean} isPlayerIdle 再生中でも順番待ちでもない時 true
 * @param {() => Record<string, any>} getDiag
 */
export function wireVoiceWarmupHooks(warmup, isPlayerIdle, getDiag) {
  if (!warmup) return;
  warmup.setHooks({
    isIdle: isPlayerIdle,
    onInit: (ms, background) => {
      if (!background) return;
      const d = getDiag();
      if (!d || typeof d !== 'object') return;
      // 裏で声を読み込んだ件数と最長(この間エンジンは他の合成ができない=次のコメントが待つ)。
      d.bgInitTotal = (Number(d.bgInitTotal) || 0) + 1;
      d.bgInitMaxMs = Math.max(Number(d.bgInitMaxMs) || 0, Math.round(ms));
    }
  });
}

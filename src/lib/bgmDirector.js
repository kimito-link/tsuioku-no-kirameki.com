/**
 * bgmDirector.js
 * council/pachinko-ultimate-SYNTHESIS.md §5(BGM設計)+§6 Phase C の実装。
 *
 * 純関数部(テスト対象・決定論): リーチ/フィーバーループの in/out 判定・ループ選択(§5.3の
 *   決定論ローテーション)・フィーバー延長上限180秒の計算。
 * 副作用部(専用Audio 1本管理): venueBar.js/popup-entry.js が呼ぶランタイム。effectSoundPlayer.js
 *   は使わない(one-shot設計のため・§5.1)。同時に鳴るBGMは常に最大1本。
 *
 * 絶対制約(§7): BGM音量上限0.30クランプ。既定OFF(オプトイン)。乱数不使用(ループ選択も順繰り)。
 */

import { PHASE } from './phaseDirector.js';

/** BGM音量の上限クランプ(§5.2「配信音声を絶対に超えない」)。 */
export const BGM_VOLUME_MAX = 0.30;

/** リーチループの既定音量。 */
export const BGM_REACH_DEFAULT_VOLUME = 0.12;
/** フィーバーループの既定音量。 */
export const BGM_FEVER_DEFAULT_VOLUME = 0.15;

/** リーチフェーズがこの時間継続したらループイン(§5.2)。 */
export const REACH_IN_DWELL_MS = 15_000;
/** リーチループの最短連続再生時間(§5.2)。これより前には自らアウトしない。 */
export const REACH_MIN_PLAY_MS = 30_000;
/** リーチループ停止後、再イン禁止の時間(§5.2)。 */
export const REACH_REENTRY_BLOCK_MS = 60_000;
/** R<2.0がこの時間継続したらリーチループをアウト(§5.2)。 */
export const REACH_OUT_DWELL_MS = 30_000;
/** リーチアウトの相対比しきい値(§5.2「out 2.0」)。 */
export const REACH_OUT_R_THRESHOLD = 2.0;

/** フィーバーの固定継続時間(§5.2)。 */
export const FEVER_BASE_DURATION_MS = 60_000;
/** フィーバー中の大当たり/gift_large以上での延長幅(§5.2)。 */
export const FEVER_EXTEND_STEP_MS = 30_000;
/** フィーバー継続時間の上限(§5.2)。 */
export const FEVER_MAX_DURATION_MS = 180_000;

/** フェードのms(§5.2の表そのもの)。 */
export const FADE_MS = Object.freeze({
  reachIn: 1_500,
  reachOutBreakthrough: 800, // 突破/大当たり遷移での即アウト
  reachOutTimeout: 2_500, // R<2.0継続によるアウト
  feverIn: 1_000,
  feverOut: 3_000
});

/** VOICEVOX発話中のダッキング音量比(§5.2「50%」)。 */
export const DUCK_VOLUME_RATIO = 0.5;
/** ダッキングのランプ時間(ms・§5.2「0.2秒ランプ」)。 */
export const DUCK_RAMP_MS = 200;

/**
 * 音量をBGM_VOLUME_MAXへクランプする純関数(§7 絶対制約)。
 * @param {number} v
 * @returns {number}
 */
export function clampBgmVolume(v) {
  const n = Number.isFinite(Number(v)) ? Number(v) : 0;
  return Math.max(0, Math.min(BGM_VOLUME_MAX, n));
}

/* ============================================================================
 * リーチループ in/out 純関数(§5.2)
 * ========================================================================== */

/**
 * @typedef {{
 *   playing: boolean,             // 現在リーチループが鳴っているか
 *   startedAt: number,            // 鳴らし始めた時刻(0=停止中)
 *   stoppedAt: number,            // 最後に止めた時刻(0=一度も止めていない=再イン禁止の対象外)
 *   reachSinceMs: number,         // フェーズがリーチに入った時刻(0=リーチでない)
 *   belowOutSinceMs: number,      // R<2.0が継続している開始時刻(0=継続していない)
 *   loopIndex: number             // 次に選ぶループの通し番号(§5.3決定論ローテーション用)
 * }} ReachBgmState
 */

/** 初期リーチBGM state。 */
export function makeInitialReachBgmState() {
  return { playing: false, startedAt: 0, stoppedAt: 0, reachSinceMs: 0, belowOutSinceMs: 0, loopIndex: 0 };
}

/**
 * @typedef {{ action: 'none'|'start'|'stop', fadeMs: number, nextState: ReachBgmState }} ReachBgmDecision
 */

/**
 * リーチループの in/out を決定論で判定する純関数(§5.2)。
 *   呼び出し側は12秒extras tick等の周期でこれを呼び、'start'/'stop'が返ったら実際にAudioを操作する。
 * @param {Partial<ReachBgmState>|null|undefined} state
 * @param {string} phase phaseDirector.PHASE.* のいずれか(現在のフェーズ)
 * @param {number} R 相対比
 * @param {number} nowMs
 * @param {{ bgmEnabled?: boolean }} [opts]
 * @returns {ReachBgmDecision}
 */
export function reachBgmDecision(state, phase, R, nowMs, opts = {}) {
  /** @type {ReachBgmState} */
  const s = state && typeof state === 'object' ? { ...makeInitialReachBgmState(), ...state } : makeInitialReachBgmState();
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const r = Number.isFinite(Number(R)) ? Number(R) : 0;
  const inReachPhase = phase === PHASE.REACH;
  const bgmEnabled = opts.bgmEnabled !== false;

  // フェーズがリーチでなくなった: reachSinceMsをリセット。既に鳴っていれば即アウト(突破/大当たり遷移)。
  if (!inReachPhase) {
    if (s.playing) {
      return {
        action: 'stop',
        fadeMs: FADE_MS.reachOutBreakthrough,
        nextState: { ...s, playing: false, startedAt: 0, stoppedAt: now, reachSinceMs: 0, belowOutSinceMs: 0 }
      };
    }
    return { action: 'none', fadeMs: 0, nextState: { ...s, reachSinceMs: 0, belowOutSinceMs: 0 } };
  }

  const reachSinceMs = s.reachSinceMs > 0 ? s.reachSinceMs : now;
  /** @type {ReachBgmState} */
  const nextBase = { ...s, reachSinceMs };

  if (!s.playing) {
    if (!bgmEnabled) return { action: 'none', fadeMs: 0, nextState: nextBase };
    const reentryBlocked = s.stoppedAt > 0 && now - s.stoppedAt < REACH_REENTRY_BLOCK_MS;
    if (reentryBlocked) return { action: 'none', fadeMs: 0, nextState: nextBase };
    const dwellOk = now - reachSinceMs >= REACH_IN_DWELL_MS;
    if (!dwellOk) return { action: 'none', fadeMs: 0, nextState: nextBase };
    return {
      action: 'start',
      fadeMs: FADE_MS.reachIn,
      nextState: { ...nextBase, playing: true, startedAt: now, belowOutSinceMs: 0, loopIndex: s.loopIndex + 1 }
    };
  }

  // 再生中: R<2.0継続30秒でタイムアウトアウト(最短連続30秒は満たしていなくても、この経路は
  //   「体感の盛り下がり」に対するアウトなので最短連続の対象外=フェーズ滞在120秒上限と役割が違う)。
  if (r < REACH_OUT_R_THRESHOLD) {
    const belowOutSinceMs = s.belowOutSinceMs > 0 ? s.belowOutSinceMs : now;
    if (now - belowOutSinceMs >= REACH_OUT_DWELL_MS) {
      return {
        action: 'stop',
        fadeMs: FADE_MS.reachOutTimeout,
        nextState: { ...nextBase, playing: false, startedAt: 0, stoppedAt: now, belowOutSinceMs: 0 }
      };
    }
    return { action: 'none', fadeMs: 0, nextState: { ...nextBase, playing: true, belowOutSinceMs } };
  }
  return { action: 'none', fadeMs: 0, nextState: { ...nextBase, playing: true, belowOutSinceMs: 0 } };
}

/**
 * 最短連続再生時間を満たしているか(呼び出し側が「突破遷移で即アウトしてよいか」を見るための補助)。
 * @param {Partial<ReachBgmState>|null|undefined} state
 * @param {number} nowMs
 * @returns {boolean}
 */
export function reachBgmMinPlaySatisfied(state, nowMs) {
  const s = state && typeof state === 'object' ? state : {};
  if (!s.playing || !(Number(s.startedAt) > 0)) return true;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  return now - Number(s.startedAt) >= REACH_MIN_PLAY_MS;
}

/* ============================================================================
 * フィーバーループ in/out・延長 純関数(§5.2)
 * ========================================================================== */

/**
 * @typedef {{
 *   playing: boolean,
 *   startedAt: number,       // フィーバー開始時刻(0=停止中)
 *   durationMs: number,      // 現在の予定継続時間(延長で伸びる。上限FEVER_MAX_DURATION_MS)
 *   loopIndex: number        // 次に選ぶループの通し番号(§5.3の (n-1) mod 6 用)
 * }} FeverBgmState
 */

/** 初期フィーバーBGM state。 */
export function makeInitialFeverBgmState() {
  return { playing: false, startedAt: 0, durationMs: 0, loopIndex: 0 };
}

/**
 * フィーバー開始を決定論で計算する純関数。payoutチェーン完了の合図が来た時に呼ぶ想定。
 * @param {Partial<FeverBgmState>|null|undefined} state
 * @param {number} nowMs
 * @param {{ bgmEnabled?: boolean }} [opts]
 * @returns {{ action: 'none'|'start', nextState: FeverBgmState }}
 */
export function feverBgmStart(state, nowMs, opts = {}) {
  /** @type {FeverBgmState} */
  const s = state && typeof state === 'object' ? { ...makeInitialFeverBgmState(), ...state } : makeInitialFeverBgmState();
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  if (opts.bgmEnabled === false) return { action: 'none', nextState: s };
  return {
    action: 'start',
    nextState: { playing: true, startedAt: now, durationMs: FEVER_BASE_DURATION_MS, loopIndex: s.loopIndex + 1 }
  };
}

/**
 * フィーバー継続中の延長(大当たり/gift_large以上・§5.2「+30秒・上限180秒」)。
 * @param {Partial<FeverBgmState>|null|undefined} state
 * @returns {FeverBgmState}
 */
export function feverBgmExtend(state) {
  /** @type {FeverBgmState} */
  const s = state && typeof state === 'object' ? { ...makeInitialFeverBgmState(), ...state } : makeInitialFeverBgmState();
  if (!s.playing) return s;
  const next = Math.min(FEVER_MAX_DURATION_MS, (Number(s.durationMs) || FEVER_BASE_DURATION_MS) + FEVER_EXTEND_STEP_MS);
  return { ...s, durationMs: next };
}

/**
 * フィーバーが終了時刻に達したかを判定する純関数。
 * @param {Partial<FeverBgmState>|null|undefined} state
 * @param {number} nowMs
 * @returns {boolean}
 */
export function feverBgmShouldEnd(state, nowMs) {
  const s = state && typeof state === 'object' ? state : {};
  if (!s.playing || !(Number(s.startedAt) > 0)) return false;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const duration = Number(s.durationMs) || FEVER_BASE_DURATION_MS;
  return now - Number(s.startedAt) >= duration;
}

/**
 * フィーバー終了(§5.2「アウト3.0秒→bgm_jingle_win」)。引数は呼び出し側の対称性のため受け取るが
 *   終了後は常に初期状態(未使用のため_prefix)。
 * @param {Partial<FeverBgmState>|null|undefined} _state
 * @returns {FeverBgmState}
 */
export function feverBgmStop(_state) {
  return makeInitialFeverBgmState();
}

/* ============================================================================
 * ループ選択の決定論(§5.3)
 * ========================================================================== */

/** リーチループ2種(bgm_reach_loop の variantPaths内インデックス想定=customSoundPreset.js側で1本のキーに複数variant)。 */
export const REACH_LOOP_VARIANT_COUNT = 2;
/** フィーバーループ6種。 */
export const FEVER_LOOP_VARIANT_COUNT = 6;

/**
 * リーチループの奇数回目/偶数回目の交互選択(§5.3)。loopIndexは1始まりの通し番号。
 * @param {number} loopIndex
 * @returns {number} 0-indexed variant index
 */
export function reachLoopVariantIndex(loopIndex) {
  const n = Math.max(1, Math.floor(Number(loopIndex) || 1));
  return (n - 1) % REACH_LOOP_VARIANT_COUNT;
}

/**
 * フィーバーループの n回目=リスト[(n-1) mod 6] の順繰り(§5.3)。
 * @param {number} loopIndex
 * @returns {number} 0-indexed variant index
 */
export function feverLoopVariantIndex(loopIndex) {
  const n = Math.max(1, Math.floor(Number(loopIndex) || 1));
  return (n - 1) % FEVER_LOOP_VARIANT_COUNT;
}

/* ============================================================================
 * 副作用部: 専用Audio 1本管理(§5.1「同時に鳴るBGMは常に最大1本」)
 * ========================================================================== */

/**
 * BGM再生ランタイムを1つ作る。venueBar.js/popup-entry.js が起動時に1個だけ生成して使い回す。
 *   effectSoundPlayer.js とは独立(one-shot設計を流用しない・loop=trueの専用Audio)。
 * @param {{ audioFactory?: (url: string) => HTMLAudioElement, setTimeoutFn?: typeof setTimeout, clearTimeoutFn?: typeof clearTimeout }} [deps]
 */
export function createBgmRuntime(deps = {}) {
  const audioFactory = deps.audioFactory || ((url) => new Audio(url));
  const setTimeoutFn = deps.setTimeoutFn || ((fn, ms) => window.setTimeout(fn, ms));
  const clearTimeoutFn = deps.clearTimeoutFn || ((id) => window.clearTimeout(id));

  /** @type {HTMLAudioElement|null} */
  let audio = null;
  let fadeTimer = 0;
  let baseVolume = 0; // ダッキング前の目標音量(クランプ済み)
  let ducked = false;

  function stopFadeTimer() {
    if (fadeTimer) {
      clearTimeoutFn(fadeTimer);
      fadeTimer = 0;
    }
  }

  /** @param {number} from @param {number} to @param {number} ms @param {() => void} [onDone] */
  function fadeTo(from, to, ms, onDone) {
    stopFadeTimer();
    if (!audio) {
      if (onDone) onDone();
      return;
    }
    const steps = Math.max(1, Math.round(ms / 50));
    let i = 0;
    const step = () => {
      i += 1;
      const t = Math.min(1, i / steps);
      try {
        audio.volume = clampBgmVolume(from + (to - from) * t);
      } catch { /* no-op */ }
      if (t >= 1) {
        if (onDone) onDone();
        return;
      }
      fadeTimer = setTimeoutFn(step, 50);
    };
    step();
  }

  return {
    /** @returns {boolean} */
    isPlaying: () => !!audio && !audio.paused,
    /**
     * ループ再生を開始する(フェードイン)。既に何か鳴っていれば先に停止してから始める
     *   (§5.1「同時最大1本」)。urlが無ければ何もしない(未割当キー=安全側で無音)。
     * @param {string} url
     * @param {number} targetVolume クランプ前の目標音量
     * @param {number} fadeMs
     */
    start(url, targetVolume, fadeMs) {
      if (!url) return; // カスタム未割当=安全側で無音(§2.4「未割当なら鳴らない」)
      stopFadeTimer();
      if (audio) {
        try { audio.pause(); } catch { /* no-op */ }
      }
      audio = audioFactory(url);
      audio.loop = true;
      baseVolume = clampBgmVolume(targetVolume);
      ducked = false;
      try {
        audio.volume = 0;
        const p = audio.play && audio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch { /* no-op */ }
      fadeTo(0, baseVolume, fadeMs);
    },
    /**
     * 再生を止める(フェードアウト)。
     * @param {number} fadeMs
     * @param {() => void} [onStopped]
     */
    stop(fadeMs, onStopped) {
      if (!audio) {
        if (onStopped) onStopped();
        return;
      }
      const current = audio;
      fadeTo(audio.volume || baseVolume, 0, fadeMs, () => {
        try { current.pause(); } catch { /* no-op */ }
        if (current === audio) audio = null;
        if (onStopped) onStopped();
      });
    },
    /** VOICEVOX発話中ダック(§5.2「50%へ0.2秒ランプ」)。 */
    duck() {
      if (!audio || ducked) return;
      ducked = true;
      fadeTo(audio.volume || baseVolume, clampBgmVolume(baseVolume * DUCK_VOLUME_RATIO), DUCK_RAMP_MS);
    },
    /** ダック解除(発話終了で復帰)。 */
    unduck() {
      if (!audio || !ducked) return;
      ducked = false;
      fadeTo(audio.volume || 0, baseVolume, DUCK_RAMP_MS);
    },
    /**
     * 音量スライダー変更時に基準音量を更新する(クランプ込み)。再生中は即座に反映。
     * @param {number} v
     */
    setBaseVolume(v) {
      baseVolume = clampBgmVolume(v);
      if (audio && !ducked) {
        try { audio.volume = baseVolume; } catch { /* no-op */ }
      }
    },
    /** テスト/クリーンアップ用: 内部stateを覗く。 */
    _debugState: () => ({ hasAudio: !!audio, baseVolume, ducked })
  };
}

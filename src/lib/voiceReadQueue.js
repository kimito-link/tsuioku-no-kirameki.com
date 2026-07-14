/**
 * 読み上げキュー末尾へ追加し、上限超過分を古い順に返す。
 * @template T
 * @param {readonly T[]|unknown} queue
 * @param {T} item
 * @param {{ max?: number }} [opts]
 * @returns {{ queue: T[], dropped: T[] }}
 */
export function pushVoiceQueue(queue, item, { max = 5 } = {}) {
  const current = Array.isArray(queue) ? [...queue] : [];
  if (item && typeof item === 'object' && /** @type {{priority?: string}} */ (item).priority === 'high') {
    // PR-V3: ギフト等優先アイテムは通常アイテムの前に割り込む
    const insertIdx = current.findIndex(x => !x || typeof x !== 'object' || /** @type {{priority?: string}} */ (x).priority !== 'high');
    if (insertIdx < 0) {
      current.push(item);
    } else {
      current.splice(insertIdx, 0, item);
    }
  } else {
    current.push(item);
  }
  const rawMax = Number(max);
  const limit = Number.isFinite(rawMax) ? Math.max(0, Math.floor(rawMax)) : 5;
  const dropCount = Math.max(0, current.length - limit);
  return {
    queue: current.slice(dropCount),
    dropped: current.slice(0, dropCount)
  };
}

/**
 * キュー内の同文項目を集約する。
 * @param {readonly { body?: unknown, count?: unknown }[]|unknown} queue
 * @param {{ body?: unknown, count?: unknown }|null|undefined} candidate
 * @returns {{
 *   queue: { body?: unknown, count?: unknown }[],
 *   merged: boolean
 * }}
 */
export function mergeRepeatedVoiceItem(queue, candidate) {
  const current = Array.isArray(queue) ? [...queue] : [];
  if (!candidate || typeof candidate !== 'object') {
    return { queue: current, merged: false };
  }
  const index = current.findIndex(
    (existing) =>
      existing &&
      typeof existing === 'object' &&
      existing.body === candidate.body
  );
  if (index < 0) return { queue: current, merged: false };

  const existing = current[index];
  const rawCount = Number(existing.count);
  const count =
    Number.isFinite(rawCount) && rawCount >= 1 ? Math.floor(rawCount) : 1;
  current[index] = { ...existing, count: count + 1 };
  return { queue: current, merged: true };
}

/**
 * プリフェッチが現在の項目と世代に一致するか返す。
 * @param {unknown} prefetch
 * @param {unknown} item
 * @param {unknown} generation
 * @returns {boolean}
 */
export function isVoicePrefetchUsable(prefetch, item, generation) {
  if (!prefetch || typeof prefetch !== 'object') return false;
  const state =
    /** @type {{ item?: unknown, generation?: unknown }} */ (prefetch);
  return state.item === item && state.generation === generation;
}

/**
 * 待機件数に応じた読み上げ速度と本文上限を返す。
 *
 * v0.1.755 リアルタイム完璧化(星野ロミ会議): 合成が実時間に追いつかない時、待つのでなく
 *   【速度を上げて本文を短く】して消化を速め、遅延を溜めない。会議結論「speedScale を上げて
 *   合成時間短縮(1.0→1.4で約30%短縮)」を取り込み、より早い段階(2件)から効かせ、最大ブーストも
 *   引き上げる(0.5→0.8)。これで「今喋ってること」に追いつき続ける。本文上限も詰まり時は短く。
 * @param {unknown} queueLength
 * @returns {{ speedBoost: number, maxChars: number }}
 */
export function computeVoiceCongestion(queueLength) {
  const rawLength = Number(queueLength);
  const length =
    Number.isFinite(rawLength) && rawLength >= 0 ? Math.floor(rawLength) : 0;
  if (length >= 8) return { speedBoost: 0.8, maxChars: 30 };
  if (length >= 5) return { speedBoost: 0.5, maxChars: 40 };
  if (length >= 3) return { speedBoost: 0.3, maxChars: 50 };
  if (length >= 2) return { speedBoost: 0.15, maxChars: 60 };
  return { speedBoost: 0, maxChars: 60 };
}

/**
 * 待機件数に応じて VOICEVOX speedScale へ加える値を返す。
 * @param {unknown} queueLength
 * @returns {number}
 */
export function computeVoiceQueueSpeedBoost(queueLength) {
  return computeVoiceCongestion(queueLength).speedBoost;
}

/**
 * v0.1.1088計器(voice-tempo-realtime-SYNTHESIS §3 Phase 1): 「コメント到着(enqueuedAt)→
 *   声が出る(onAudioStart)」までの体感遅延(E2E)を EMA で均す純関数。
 *   窓バッファを持たない(直前の平均値だけを状態として持ち回す)=メモリ有界・純粋。
 * @param {unknown} prevAvgMs 直前の平均値(-1=未計測)
 * @param {unknown} sampleMs 今回の実測値(ms)
 * @param {number} [alpha] EMA係数(既定0.3=直近を重視しつつ振れを均す)
 * @returns {number} 更新後の平均値(ms・整数丸め)
 */
export function computeVoiceE2eAverage(prevAvgMs, sampleMs, alpha = 0.3) {
  const sample = Number(sampleMs);
  if (!Number.isFinite(sample) || sample < 0) {
    const prev = Number(prevAvgMs);
    return Number.isFinite(prev) ? prev : -1;
  }
  const prev = Number(prevAvgMs);
  if (!Number.isFinite(prev) || prev < 0) return Math.round(sample);
  return Math.round(prev + alpha * (sample - prev));
}

const VOICE_PLAYBACK_RATE_MAX = 1.35;

/**
 * voice-tempo-realtime-SYNTHESIS §3 Phase 2: 先読み合成した WAV は「合成した瞬間の混雑度」の
 *   速度(speedBoost)で焼き固まる。その後キューが膨らんでも遅い声のまま再生される構造穴を、
 *   再生直前の playbackRate(preservesPitch=true・Chrome標準)でゼロコスト補正する。
 *   決定論(入力2点のみ・乱数なし)・上げるだけ(下げない=間延び退行を防ぐ)・上限1.35でclamp。
 * @param {unknown} boostAtSynth 合成起動時点のspeedBoost(0〜0.8)
 * @param {unknown} boostNow 再生直前(今)のspeedBoost(0〜0.8)
 * @returns {number} audio.playbackRate に設定する倍率(1.0〜1.35)。不正値は1.0にフォールバック。
 */
export function computeVoicePlaybackRate(boostAtSynth, boostNow) {
  const at = Number(boostAtSynth);
  const now = Number(boostNow);
  if (!Number.isFinite(at) || !Number.isFinite(now)) return 1.0;
  const rate = (1 + now) / (1 + at);
  return Math.min(VOICE_PLAYBACK_RATE_MAX, Math.max(1.0, rate));
}

/**
 * 合成パイプラインの「先読み深さ」(再生中に何件先まで先行合成するか)を返す純関数。
 *
 * v0.1.768 リアルタイム最大化(2026-06-16 会議+実コード裏取り): 従来の drain ループは
 *   再生中に N+1 を1件だけ先行合成する【深さ1】で、N の再生が終わるまで N+2 以降の合成が
 *   遊んでいた=フラッド時に合成が前に出られず、これがコメビュに負ける唯一の構造的理由だった。
 *   そこで「詰まるほど先読みを深くする」ことで、再生時間ぶんを使って先の合成を貯める。
 *   同一 VOICEVOX サーバへの並行 audio_query/synthesis は可能。再生は元々1本ずつ(重ねない)
 *   なので増やすのは“合成の先読み深さ”だけ=不協和は起きない。CPU 有界化のため上限は3。
 *
 *   落ち着いている時(待機<=2)は深さ1=無駄打ちしない。3〜4件で2、5件以上で3(上限)。
 *   pending(実際に先読みできる件数)が小さければそれで頭打ち=無いものは先読みできない。
 *
 * @param {unknown} queueLength 混雑判定に使う待機件数
 * @param {{ pending?: unknown }} [opts] pending=先読み対象として実在する件数(任意・深さの上限)
 * @returns {number} 0以上の整数(先読み深さ)
 */
export function resolveVoiceSynthDepth(queueLength, opts = {}) {
  const rawLength = Number(queueLength);
  const length =
    Number.isFinite(rawLength) && rawLength >= 0 ? Math.floor(rawLength) : 0;
  let depth;
  if (length >= 5) depth = 3;
  else if (length >= 3) depth = 2;
  else depth = 1;
  const rawPending = Number(opts?.pending);
  if (Number.isFinite(rawPending) && rawPending >= 0) {
    depth = Math.min(depth, Math.floor(rawPending));
  }
  return depth;
}

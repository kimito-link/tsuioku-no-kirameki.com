/**
 * venueBubbleChurn.js — 会場「応援TOP」吹き出しchurnの実測計器(診断先行アプローチ)。
 *
 * 背景: ユーザー実機報告「応援TOPがちらちら入れ替わる」。コード読解の結果、吹き出しの寿命は
 *   コメント流量に応じて自動的に短くなる設計(resolveBubbleFlowLifetimeMs = base/√rate、
 *   下限1200ms)で、速い配信ほど頻繁に切り替わるのは意図的な仕様。ただし実際の切り替わり頻度が
 *   「仕様の範囲内」か「行き過ぎている」かを判断する計器が一切無かった。
 *
 *   本モジュールは「直す」のではなく「実害の有無・頻度を数える」ことだけが目的(観測のみ)。
 *   掟(venueSeatLinkParity.js等と同じ): 数えるだけ・DOM/データを一切触らない・新規のDOM走査や
 *   setInterval等の継続コストを持ち込まない(実際に発生したイベントが起きたその場で+1するだけ)。
 *
 * 2026-07-24拡張(council-fable設計venue-bubble-voice-realtime-max-DESIGN.md D-3): 消滅時の
 *   voiceState分布(voiced/unvoiced)を追加。「鳴っている声の吹き出しが残るため同期している
 *   ように見えるが、その間に新着がunvoicedで流れ切っている」という偽陽性(D章)を検出する。
 *
 * @module venueBubbleChurn
 */

/** 寿命バケットの閾値(ms)。速い配信でchurnが増えている実態を分布で可視化する。 */
const SHORT_LIFETIME_MS = 1500;
const MID_LIFETIME_MS = 3000;

/**
 * @returns {{ spawned: number, shortCount: number, midCount: number, longCount: number,
 *   evicted: number, lastRatePerSec: number, removedVoiced: number, removedUnvoiced: number }}
 */
export function createVenueBubbleChurnState() {
  return {
    spawned: 0,
    shortCount: 0,
    midCount: 0,
    longCount: 0,
    evicted: 0,
    lastRatePerSec: 0,
    removedVoiced: 0,
    removedUnvoiced: 0
  };
}

/**
 * 吹き出しが1個生成されるたびに呼ぶ(showSpeechBubble内)。
 * @param {ReturnType<typeof createVenueBubbleChurnState>|null|undefined} state
 * @param {{ flowLifetimeMs?: unknown, ratePerSec?: unknown }} obs
 */
export function observeVenueBubbleSpawn(state, obs) {
  if (!state || typeof state !== 'object' || !obs || typeof obs !== 'object') return;
  state.spawned += 1;
  const lifetime = Number(obs.flowLifetimeMs);
  if (Number.isFinite(lifetime)) {
    if (lifetime < SHORT_LIFETIME_MS) state.shortCount += 1;
    else if (lifetime < MID_LIFETIME_MS) state.midCount += 1;
    else state.longCount += 1;
  }
  const rate = Number(obs.ratePerSec);
  if (Number.isFinite(rate) && rate >= 0) state.lastRatePerSec = rate;
}

/**
 * 上限超過による強制退去が発生したときに呼ぶ(selectBubblesToEvict呼び出し側)。
 * @param {ReturnType<typeof createVenueBubbleChurnState>|null|undefined} state
 * @param {number} count 退去させた件数
 */
export function observeVenueBubbleEviction(state, count) {
  if (!state || typeof state !== 'object') return;
  const n = Math.max(0, Math.floor(Number(count) || 0));
  state.evicted += n;
}

/** voiced判定の対象(声が実際に鳴った状態に到達した)voiceState値。 */
const VOICED_STATES = new Set(['speaking', 'done']);

/**
 * 吹き出しが消滅する(removeBubble)たびに呼び、その時点のvoiceStateがvoiced(speaking/done=
 * 声が実際に鳴った/鳴っている)かunvoiced(pending/unvoiced=鳴らずに消えた)かを数える。
 * @param {ReturnType<typeof createVenueBubbleChurnState>|null|undefined} state
 * @param {unknown} voiceState 消滅時点のbubble.voiceState
 */
export function observeVenueBubbleRemoval(state, voiceState) {
  if (!state || typeof state !== 'object') return;
  if (VOICED_STATES.has(String(voiceState))) state.removedVoiced += 1;
  else state.removedUnvoiced += 1;
}

/**
 * 状態速報1行を作る。spawned=0(未観測)は⚪(誤報しない)。
 * @param {ReturnType<typeof createVenueBubbleChurnState>|null|undefined} state
 * @returns {{ line: string, spawned: number, shortCount: number, midCount: number, longCount: number,
 *   evicted: number, lastRatePerSec: number, removedVoiced: number, removedUnvoiced: number } | null}
 */
export function toVenueBubbleChurnDiag(state) {
  if (!state || typeof state !== 'object') return null;
  let line;
  if (state.spawned <= 0) {
    line = '応援TOP吹き出し ⚪ 未観測';
  } else {
    const removedTotal = state.removedVoiced + state.removedUnvoiced;
    const unvoicedRatioStr =
      removedTotal > 0 ? `${Math.round((state.removedUnvoiced / removedTotal) * 1000) / 10}%` : '-';
    line =
      `応援TOP吹き出し 生成累計${state.spawned}` +
      `(短命<1.5s:${state.shortCount} 中1.5-3s:${state.midCount} 長>3s:${state.longCount})` +
      ` / 強制退去${state.evicted} / 直近流速${Math.round(state.lastRatePerSec * 10) / 10}件/秒` +
      ` / 消滅時voiced${state.removedVoiced}・unvoiced${state.removedUnvoiced}(unvoiced率${unvoicedRatioStr})`;
  }
  return {
    line,
    spawned: state.spawned,
    shortCount: state.shortCount,
    midCount: state.midCount,
    longCount: state.longCount,
    evicted: state.evicted,
    lastRatePerSec: state.lastRatePerSec,
    removedVoiced: state.removedVoiced,
    removedUnvoiced: state.removedUnvoiced
  };
}

/**
 * 記録停止ウォッチドッグの純粋判定ロジック。
 *
 * 背景（2026-06-01 実機）: 複数ライブを同時タブで開くと、裏タブの大規模放送が
 *   「チャンク移行 set の一度のタイムアウト→以後 O(N) 書き込み固定→16s ガードに毎回到達」
 *   や「page-intercept 傍受の desync」で、記録カウントが伸びなくなる。
 *   人手のコンソール調査・F5 を不要にするため、独立信号（公式コメ数＝本家コメの伸び）を
 *   使って「公式は増えているのに記録が一定時間伸びない」を検知し、段階的に自己回復する。
 *
 * この関数群は I/O を持たない純粋関数（content 側が状態と副作用を担う）。
 */

/** 記録が「伸びていない」と見なすまでの猶予（ms）。 */
export const RECORDING_STALL_GRACE_MS = 30_000;

/** 公式−記録がこの値を超えたときだけ「未取得の差」とみなす（端数や追い越しを無視）。 */
export const RECORDING_STALL_MIN_GAP = 5;

/** 公式コメ数がこの時間内に伸びている＝ライブが実際にコメントを生んでいる、と見なす。 */
export const RECORDING_STALL_OFFICIAL_FRESH_MS = 90_000;

/** 回復アクションの最小間隔（連打防止）。 */
export const RECORDING_STALL_RECOVERY_COOLDOWN_MS = 20_000;

/**
 * 記録が停止しているかを判定する純関数。
 *
 * 「停止」= 録画中 && 公式コメ数が有限で前進中 && 公式−記録が minGap を超える &&
 *           記録が graceMs 以上伸びていない。
 *
 * @param {object} state
 * @param {boolean} state.recording 録画中か
 * @param {number|null} state.officialCount 公式コメ数（本家コメ）。null/非有限は判定不能
 * @param {number} state.recordedCount 記録済み件数
 * @param {number} state.lastRecordedGrowthAtMs 記録が最後に増えた時刻（ms）
 * @param {number} state.lastOfficialGrowthAtMs 公式が最後に増えた時刻（ms）
 * @param {number} state.nowMs 現在時刻（ms）
 * @param {number} [state.graceMs]
 * @param {number} [state.minGap]
 * @param {number} [state.officialFreshMs]
 * @returns {{ stalled: boolean, reason: string }}
 */
export function evaluateRecordingStall(state) {
  if (!state || !state.recording) {
    return { stalled: false, reason: 'not_recording' };
  }
  const graceMs = positiveOr(state.graceMs, RECORDING_STALL_GRACE_MS);
  const minGap = nonNegativeOr(state.minGap, RECORDING_STALL_MIN_GAP);
  const officialFreshMs = positiveOr(
    state.officialFreshMs,
    RECORDING_STALL_OFFICIAL_FRESH_MS
  );

  const official = Number(state.officialCount);
  if (!Number.isFinite(official) || official <= 0) {
    return { stalled: false, reason: 'no_official' };
  }

  const recorded = Number(state.recordedCount);
  const recordedSafe = Number.isFinite(recorded) && recorded > 0 ? recorded : 0;
  const gap = official - recordedSafe;
  if (gap <= minGap) return { stalled: false, reason: 'caught_up' };

  // 公式が実際に前進していることを要件にする（番組が止まっている/終わっているなら
  //   記録が伸びないのは正常なので、停止扱いしない＝無駄な回復を撃たない）。
  const now = Number(state.nowMs) || 0;
  const officialAgeMs = now - (Number(state.lastOfficialGrowthAtMs) || 0);
  if (!(officialAgeMs <= officialFreshMs)) {
    return { stalled: false, reason: 'official_idle' };
  }

  const recordedAgeMs = now - (Number(state.lastRecordedGrowthAtMs) || 0);
  if (recordedAgeMs < graceMs) {
    return { stalled: false, reason: 'recently_grew' };
  }

  return { stalled: true, reason: 'recorded_flat_while_official_advancing' };
}

/**
 * 停止回復アクションを段階的に選ぶ純関数（軽い手から重い手へエスカレーション）。
 *   1回目: flush のみ（コアレッサを即フラッシュ）
 *   2回目: + reseed（シード再実行＝チャンク移行リトライ含む・チェーン un-poison）
 *   3回目以降: + forwardCrawl（傍受非依存の前方向 NDGR 継続取得で capture desync を補償）
 *
 * @param {number} attemptIndex 1 始まりの試行回数
 * @returns {{ flush: boolean, reseed: boolean, forwardCrawl: boolean }}
 */
export function pickStallRecoveryActions(attemptIndex) {
  const i = Math.max(1, Math.floor(Number(attemptIndex) || 1));
  if (i === 1) return { flush: true, reseed: false, forwardCrawl: false };
  if (i === 2) return { flush: true, reseed: true, forwardCrawl: false };
  return { flush: true, reseed: true, forwardCrawl: true };
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function positiveOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function nonNegativeOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

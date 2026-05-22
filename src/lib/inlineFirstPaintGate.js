/**
 * 初回パネル表示ゲート（横付き）の純粋判定ロジック。
 *
 * 課題（実機 lv350582635 で実測）: watch を開いた直後 ~300-500ms は niconico の
 * `___leo-player___` flex 行が未完成で、beside の挿入先（動画列の隣）が見つからず
 * パネルが below（動画の下に細い帯）に一瞬落ち、~300ms 後に横付きへジャンプする。
 * この「崩れた初回」を見せないため、挿入先の幾何が**安定**するまで描画を遅らせる。
 *
 * 設計（会議 4 AI 合意・[[plan_v0303_initial_render_gate]]）:
 *   - DOM/timer/IO には触らない純関数のみ。content-entry が MutationObserver / rAF /
 *     deadline を駆動し、本モジュールに「今の挿入先 rect」と「経過」を渡して判定を仰ぐ。
 *   - 「安定」= 直近 N フレーム連続で挿入先 rect がほぼ同一（差し替え途中の中間 rect
 *     を掴む早すぎ誤検知を防ぐ）。
 *   - deadline 超過時は安定未確認でも「描画してよい」を返す（お困り配信者で leo-player
 *     が render に到達しないケースの安全網）。
 */

/**
 * @typedef {{ left: number, top: number, width: number, height: number } | null} RectLike
 */

/**
 * 2 つの rect がほぼ同一か（許容差 tolerancePx 以内）。どちらか null なら false。
 * @param {RectLike} a
 * @param {RectLike} b
 * @param {number} tolerancePx
 * @returns {boolean}
 */
export function rectsApproxEqual(a, b, tolerancePx) {
  if (!a || !b) return false;
  const tol = Number.isFinite(tolerancePx) ? Math.max(0, tolerancePx) : 0;
  return (
    Math.abs((a.left || 0) - (b.left || 0)) <= tol &&
    Math.abs((a.top || 0) - (b.top || 0)) <= tol &&
    Math.abs((a.width || 0) - (b.width || 0)) <= tol &&
    Math.abs((a.height || 0) - (b.height || 0)) <= tol
  );
}

/**
 * ゲートの可変状態を作る。content-entry が watch 初回描画ごとに 1 つ持つ。
 * @param {{ startedAtMs: number }} opts
 * @returns {{ startedAtMs: number, lastRect: RectLike, stableCount: number, settled: boolean }}
 */
export function createFirstPaintGateState(opts) {
  return {
    startedAtMs: Number(opts?.startedAtMs) || 0,
    lastRect: null,
    stableCount: 0,
    settled: false
  };
}

/**
 * 1 フレーム分の観測を取り込み、「今 beside を描画してよいか」を判定する純関数。
 * 状態 `state` は破壊的に更新する（呼出元が rAF ごとに同じ state を渡す）。
 *
 * @param {ReturnType<typeof createFirstPaintGateState>} state
 * @param {{
 *   insertionRect: RectLike,   // findBesideFlexRowColumnInsertion 由来の挿入先 rect（無ければ null）
 *   nowMs: number,
 *   deadlineMs: number,        // INLINE_FIRST_PAINT.besideSettleDeadlineMs
 *   stableFrames: number,      // INLINE_FIRST_PAINT.geomStableFrames
 *   tolerancePx: number        // INLINE_FIRST_PAINT.geomStableTolerancePx
 * }} obs
 * @returns {{ shouldPaint: boolean, reason: 'stable' | 'deadline' | 'already' | 'waiting', stableCount: number }}
 */
export function observeFirstPaintFrame(state, obs) {
  if (!state) {
    return { shouldPaint: true, reason: 'already', stableCount: 0 };
  }
  // 既に確定済みなら以後は常に描画 OK（ゲートは初回 1 回限り）。
  if (state.settled) {
    return { shouldPaint: true, reason: 'already', stableCount: state.stableCount };
  }
  const nowMs = Number(obs?.nowMs) || 0;
  const deadlineMs = Number(obs?.deadlineMs) || 0;
  const stableFrames = Math.max(1, Number(obs?.stableFrames) || 1);
  const tol = Number(obs?.tolerancePx) || 0;
  const rect = obs?.insertionRect ?? null;

  // 挿入先が解決できていれば、前フレームとの一致で安定カウントを進める。
  if (rect) {
    if (rectsApproxEqual(state.lastRect, rect, tol)) {
      state.stableCount += 1;
    } else {
      state.stableCount = 1; // 解決はできたが動いている＝カウント再スタート
    }
    state.lastRect = rect;
    if (state.stableCount >= stableFrames) {
      state.settled = true;
      return { shouldPaint: true, reason: 'stable', stableCount: state.stableCount };
    }
  } else {
    // 挿入先未解決＝leo-player 未完成。カウントは進めない（rect は保持しない）。
    state.stableCount = 0;
    state.lastRect = null;
  }

  // deadline 超過: 安定未確認でも描画する（安全網）。
  if (deadlineMs > 0 && nowMs - state.startedAtMs >= deadlineMs) {
    state.settled = true;
    return { shouldPaint: true, reason: 'deadline', stableCount: state.stableCount };
  }

  return { shouldPaint: false, reason: 'waiting', stableCount: state.stableCount };
}

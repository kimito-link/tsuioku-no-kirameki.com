// @ts-nocheck — 任意の probe オブジェクトを歩く動的計数(storyUserLaneRenderProbe.js と同型)
/**
 * laneTickProbe.js — ①popup の独立描画トリガ(tickIndependentNorthStar)の自己診断(v0.1.1123)。
 *
 * 背景(reference_venue_cleanup_SYNTHESIS.md の別送お題 timeshift-popup-paint D-0):
 *   実機で「応援レーン描画 started=0(描画関数が一度も呼ばれていない)」が生放送中にも発生し、
 *   さらに「ローディングがつねに出る」報告がある。幕には3重フェイルセーフがあり永続はありえない
 *   =再出現の疑い。真因候補は tick の早期return(lid解決全滅/document.hidden/スクロールdefer)と
 *   iframe再生成だが、どれかを【実測せずに】patchを打つのは whack-a-mole。本probeはtickの
 *   結末を理由別に数えるだけ(挙動変更ゼロ・storage新キーゼロ=popup固有診断JSONに同乗)。
 *
 * 純データ(chrome/DOM非依存)=単体テスト可能。
 * @module laneTickProbe
 */

/** tick の結末コード(lastReason に入る値の正本)。 */
export const LANE_TICK_REASONS = Object.freeze({
  RUN: 'run', // 全ガードを通過し描画関数群を起動した
  NO_CONTEXT: 'no-context', // 拡張コンテキスト消失
  DOC_HIDDEN: 'doc-hidden', // タブ非表示(document.hidden)
  DEFER_HEAVY: 'defer-heavy', // スクロール直後の heavy paint 見送り
  LID_MISS: 'lid-miss' // lid 解決3段(inline→snapshot→lastPainted)が全滅
});

/** lid をどの段で解決できたか。 */
export const LANE_TICK_LID_SOURCES = Object.freeze({
  INLINE: 'inline',
  SNAPSHOT: 'snapshot',
  LAST_PAINTED: 'lastPainted'
});

/** @returns {object} popup-entry が1個だけ持つ初期状態。 */
export function createLaneTickProbe() {
  return {
    ticks: 0,
    runs: 0,
    noContext: 0,
    docHidden: 0,
    deferHeavy: 0,
    lidMiss: 0,
    lidFromInline: 0,
    lidFromSnapshot: 0,
    lidFromLastPainted: 0,
    lastReason: '',
    lastLid: '',
    lastRunAtBase: 0
  };
}

/**
 * tick 1回の結末を記録する(popup-entry の tick 内から1行で呼ぶ)。
 * @param {object} probe createLaneTickProbe() の戻り
 * @param {string} reason LANE_TICK_REASONS のいずれか
 * @param {{ lidSource?: string, lid?: string, nowMs?: number }} [extra]
 */
export function recordLaneTick(probe, reason, extra = {}) {
  if (!probe || typeof probe !== 'object') return;
  probe.ticks = (Number(probe.ticks) || 0) + 1;
  probe.lastReason = String(reason || '');
  if (reason === LANE_TICK_REASONS.RUN) {
    probe.runs = (Number(probe.runs) || 0) + 1;
    if (Number.isFinite(Number(extra.nowMs))) probe.lastRunAtBase = Number(extra.nowMs);
    const src = String(extra.lidSource || '');
    if (src === LANE_TICK_LID_SOURCES.INLINE) probe.lidFromInline += 1;
    else if (src === LANE_TICK_LID_SOURCES.SNAPSHOT) probe.lidFromSnapshot += 1;
    else if (src === LANE_TICK_LID_SOURCES.LAST_PAINTED) probe.lidFromLastPainted += 1;
    if (extra.lid) probe.lastLid = String(extra.lid);
  } else if (reason === LANE_TICK_REASONS.NO_CONTEXT) probe.noContext += 1;
  else if (reason === LANE_TICK_REASONS.DOC_HIDDEN) probe.docHidden += 1;
  else if (reason === LANE_TICK_REASONS.DEFER_HEAVY) probe.deferHeavy += 1;
  else if (reason === LANE_TICK_REASONS.LID_MISS) probe.lidMiss += 1;
}

/**
 * 診断JSON(popup固有診断)へ出す形。
 * @param {object} probe
 * @param {number} nowMs
 * @returns {object|null}
 */
export function snapshotLaneTickProbe(probe, nowMs) {
  if (!probe || typeof probe !== 'object') return null;
  const now = Number(nowMs) || 0;
  return {
    ticks: Number(probe.ticks) || 0,
    runs: Number(probe.runs) || 0,
    noContext: Number(probe.noContext) || 0,
    docHidden: Number(probe.docHidden) || 0,
    deferHeavy: Number(probe.deferHeavy) || 0,
    lidMiss: Number(probe.lidMiss) || 0,
    lidFromInline: Number(probe.lidFromInline) || 0,
    lidFromSnapshot: Number(probe.lidFromSnapshot) || 0,
    lidFromLastPainted: Number(probe.lidFromLastPainted) || 0,
    lastReason: String(probe.lastReason || ''),
    lastLid: String(probe.lastLid || ''),
    lastRunAgoMs:
      Number(probe.lastRunAtBase) > 0 && now > 0
        ? Math.max(0, now - Number(probe.lastRunAtBase))
        : null
  };
}

/**
 * 配信切替(SPA遷移)の「送信N/受信N/初描画ms」観測値を組み立てる純関数群。
 * instantPushDiag.js と同じ思想(content/popup が書き、status が読んで状態速報に再表示する。
 * 記録/演出/音には一切触れない)。
 *
 * 目的(2026-07-06): iframe を作り直さず in-place で lv を切り替える経路(liveChannelSwitch.js)が
 * 実際に機能しているか(切替イベントは来ているのに描画が追いついていない等)を状態速報1枚で
 * 確認できるようにする。
 *
 * @typedef {{
 *   sentCount: number,      // content-entry が postMessage で送った回数
 *   receivedCount: number,  // popup-entry が nonce 照合に成功して受け取った回数
 *   rejectedCount: number,  // nonce 不一致 / lv 形式不正で破棄した回数
 *   lastSwitchToPaintMs: number, // 直近1回の「切替受信→初描画完了」ms(-1=未計測)
 *   avgSwitchToPaintMs: number,  // 上記の EMA 平均ms(-1=未計測)
 *   lastEventAt: number     // 最後にイベントが起きた時刻(epoch ms・0=未観測)
 * }} ChannelSwitchDiagState
 */

/** 初期 配信切替診断 state。 */
export function makeInitialChannelSwitchDiag() {
  return {
    sentCount: 0,
    receivedCount: 0,
    rejectedCount: 0,
    lastSwitchToPaintMs: -1,
    avgSwitchToPaintMs: -1,
    lastEventAt: 0
  };
}

/** @param {Partial<ChannelSwitchDiagState>|null|undefined} diag @returns {ChannelSwitchDiagState} */
function buildChannelSwitchDiagSnapshotInternal(diag) {
  const base = makeInitialChannelSwitchDiag();
  const d = /** @type {any} */ (diag && typeof diag === 'object' ? diag : {});
  /** @param {unknown} x @param {number} fallback @returns {number} */
  const num = (x, fallback) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    sentCount: num(d.sentCount, base.sentCount),
    receivedCount: num(d.receivedCount, base.receivedCount),
    rejectedCount: num(d.rejectedCount, base.rejectedCount),
    lastSwitchToPaintMs: num(d.lastSwitchToPaintMs, base.lastSwitchToPaintMs),
    avgSwitchToPaintMs: num(d.avgSwitchToPaintMs, base.avgSwitchToPaintMs),
    lastEventAt: num(d.lastEventAt, base.lastEventAt)
  };
}

/**
 * 直前の state に「今回の差分」を積算した次 state を作る純関数。
 *   sentCount/receivedCount/rejectedCount は加算、lastSwitchToPaintMs/avgSwitchToPaintMs は置換、
 *   lastEventAt は delta.lastEventAt があれば採用、無ければ既存値を保持。
 * @param {Partial<ChannelSwitchDiagState>|null|undefined} prev
 * @param {{ sentCount?: number, receivedCount?: number, rejectedCount?: number,
 *   lastSwitchToPaintMs?: number, avgSwitchToPaintMs?: number, lastEventAt?: number }} delta
 * @returns {ChannelSwitchDiagState}
 */
export function applyChannelSwitchDiagDelta(prev, delta) {
  const base = buildChannelSwitchDiagSnapshotInternal(prev);
  const d = delta && typeof delta === 'object' ? delta : {};
  /** @param {unknown} x @returns {number} */
  const addend = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  return {
    sentCount: base.sentCount + addend(d.sentCount),
    receivedCount: base.receivedCount + addend(d.receivedCount),
    rejectedCount: base.rejectedCount + addend(d.rejectedCount),
    lastSwitchToPaintMs:
      d.lastSwitchToPaintMs != null && Number.isFinite(Number(d.lastSwitchToPaintMs))
        ? Number(d.lastSwitchToPaintMs)
        : base.lastSwitchToPaintMs,
    avgSwitchToPaintMs:
      d.avgSwitchToPaintMs != null && Number.isFinite(Number(d.avgSwitchToPaintMs))
        ? Number(d.avgSwitchToPaintMs)
        : base.avgSwitchToPaintMs,
    lastEventAt:
      d.lastEventAt != null && Number.isFinite(Number(d.lastEventAt))
        ? Number(d.lastEventAt)
        : base.lastEventAt
  };
}

/**
 * EMA(指数移動平均)で切替→初描画 gapMs の平均を更新する純関数。instantCommentPush.js の
 * computeInstantPushGapAverage と同じ方式(窓バッファ無し=メモリ有界)。
 * @param {unknown} prevAvgMs 直前の平均値(-1=未計測)
 * @param {unknown} sampleMs 今回の実測値(ms)
 * @param {number} [alpha] EMA 係数(既定 0.3)
 * @returns {number} 更新後の平均値(整数丸め・-1=未計測のまま)
 */
export function computeChannelSwitchPaintGapAverage(prevAvgMs, sampleMs, alpha = 0.3) {
  const sample = Number(sampleMs);
  if (!Number.isFinite(sample) || sample < 0) {
    const prev = Number(prevAvgMs);
    return Number.isFinite(prev) ? prev : -1;
  }
  const prev = Number(prevAvgMs);
  if (!Number.isFinite(prev) || prev < 0) return Math.round(sample);
  return Math.round(prev + alpha * (sample - prev));
}

/**
 * storage 書き込み用の軽量スナップショット(欠損は初期値で埋める)。既存 storage 値との
 *   read-merge-write を呼び出し側で行う前提の「不足フィールドを補う」正規化。
 * @param {Partial<ChannelSwitchDiagState>|null|undefined} diag
 * @param {number} [nowMs]
 * @returns {ChannelSwitchDiagState & { capturedAt: number }}
 */
export function buildChannelSwitchDiagSnapshot(diag, nowMs) {
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  return { ...buildChannelSwitchDiagSnapshotInternal(diag), capturedAt: now };
}

/**
 * 状態速報に出す行群を作る純関数。一度も切替イベントが無ければ空配列(ノイズにしない)。
 * @param {(ChannelSwitchDiagState & { capturedAt?: number })|null|undefined} snap
 * @param {number} nowMs 現在時刻(最終イベント ago の算出用)
 * @returns {string[]}
 */
export function buildChannelSwitchDiagLines(snap, nowMs) {
  if (!snap || typeof snap !== 'object') return [];
  const sentCount = Number(snap.sentCount) || 0;
  const receivedCount = Number(snap.receivedCount) || 0;
  if (sentCount === 0 && receivedCount === 0) return []; // 未観測=このセッションで切替が無かった
  const rejectedCount = Number(snap.rejectedCount) || 0;
  const lastMs = Number(snap.lastSwitchToPaintMs);
  const avgMs = Number(snap.avgSwitchToPaintMs);
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const lastAt = Number(snap.lastEventAt) || 0;
  const agoText = lastAt > 0 && now > 0 ? ` / 最終${Math.max(0, Math.round((now - lastAt) / 1000))}秒前` : '';
  const gapText =
    Number.isFinite(lastMs) && lastMs >= 0
      ? `初描画 直近${lastMs}ms${Number.isFinite(avgMs) && avgMs >= 0 ? `(平均${avgMs}ms)` : ''}`
      : '初描画 未計測';
  return [
    `配信切替: 送信${sentCount}件 / 受信${receivedCount}件 / 破棄${rejectedCount}${agoText}`,
    `  → ${gapText}`
  ];
}

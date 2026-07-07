/**
 * コメント即時プッシュレーン(storage迂回)の「送信N/受信N/表示遅延ms」観測値を
 * 組み立てる純関数群。commentPostDiag.js と同じ思想(content/popup が書き、status が読んで
 * 状態速報に再表示する。記録/演出/音には一切触れない)。
 *
 * 目的(2026-07-06): 大負荷時に storage 経由の表示配達が数秒〜十数秒化する問題への対策として
 * content→iframe 直接 postMessage(即時プッシュ)を新設した。この経路が実際に機能しているか
 * (送っているのに受けていない・受けているのに表示に反映されない等)を状態速報1枚で
 * 確認できるようにする。
 *
 * @typedef {{
 *   sentCount: number,      // content-entry が postMessage で送った回数(バッチ単位)
 *   sentRows: number,       // 送った行の累計件数
 *   receivedCount: number,  // popup-entry が nonce 照合に成功して受け取った回数
 *   receivedRows: number,   // 受け取った行の累計件数
 *   rejectedCount: number,  // nonce 不一致 / 型不正で破棄した回数
 *   paintedRows: number,    // 実際にレーン表示バッファへ合流できた行の累計件数(重複除く)
 *   lastGapMs: number,      // 直近1回の「送信→表示合流(描画完了)」ms(-1=未計測)
 *   avgGapMs: number,       // gapMs(描画完了まで)の EMA 平均ms(-1=未計測)
 *   lastDeliveryGapMs: number, // 直近1回の「送信→ハンドラ受信」ms=配達のみ(-1=未計測)
 *   avgDeliveryGapMs: number,  // deliveryGapMs の EMA 平均ms(-1=未計測)
 *   lastEventAt: number     // 最後にイベントが起きた時刻(epoch ms・0=未観測)
 * }} InstantPushDiagState
 *
 * robust-arch Phase 0 (2026-07-07): lastGapMs/avgGapMs は「送信→**描画完了**」の全経路。
 *   これを「配達(送信→ハンドラ受信)」と「描画(受信→描画完了)」に分けるため
 *   lastDeliveryGapMs/avgDeliveryGapMs(配達のみ)を追加した。描画分 ≈ avgGapMs - avgDeliveryGapMs。
 *   MVP(min-gap 3000→12000+prune)が外れた場合、この2値の大小で次の1手が数値で確定する
 *   (配達支配→書込輻輳=設計通り / 描画支配→Phase3 を繰り上げ)。既存 avgGapMs の意味は不変。
 */

/** 初期 即時プッシュ診断 state。 */
export function makeInitialInstantPushDiag() {
  return {
    sentCount: 0,
    sentRows: 0,
    receivedCount: 0,
    receivedRows: 0,
    rejectedCount: 0,
    paintedRows: 0,
    lastGapMs: -1,
    avgGapMs: -1,
    lastDeliveryGapMs: -1,
    avgDeliveryGapMs: -1,
    lastEventAt: 0
  };
}

/**
 * 直前の state に「今回の差分」を積算した次 state を作る純関数。
 *   sentCount/sentRows/receivedCount/receivedRows/rejectedCount/paintedRows は加算、
 *   lastGapMs は置換、avgGapMs は computeInstantPushGapAverage の呼び出し側が別途計算して
 *   渡す(このファイルは循環 import を避けるため EMA 計算自体は instantCommentPush.js 側)。
 *   lastEventAt は delta.lastEventAt があれば採用、無ければ既存値を保持。
 * @param {Partial<InstantPushDiagState>|null|undefined} prev
 * @param {{ sentCount?: number, sentRows?: number, receivedCount?: number, receivedRows?: number,
 *   rejectedCount?: number, paintedRows?: number, lastGapMs?: number, avgGapMs?: number,
 *   lastDeliveryGapMs?: number, avgDeliveryGapMs?: number, lastEventAt?: number }} delta
 * @returns {InstantPushDiagState}
 */
export function applyInstantPushDiagDelta(prev, delta) {
  const base = buildInstantPushDiagSnapshotInternal(prev);
  const d = delta && typeof delta === 'object' ? delta : {};
  /** @param {unknown} x @returns {number} */
  const addend = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  /**
   * delta にキーがあれば置換・無ければ既存維持(diagFlushThrottle の畳み込み契約)。
   * @param {unknown} x @param {number} keep @returns {number}
   */
  const replaceOrKeep = (x, keep) => (x != null && Number.isFinite(Number(x)) ? Number(x) : keep);
  return {
    sentCount: base.sentCount + addend(d.sentCount),
    sentRows: base.sentRows + addend(d.sentRows),
    receivedCount: base.receivedCount + addend(d.receivedCount),
    receivedRows: base.receivedRows + addend(d.receivedRows),
    rejectedCount: base.rejectedCount + addend(d.rejectedCount),
    paintedRows: base.paintedRows + addend(d.paintedRows),
    lastGapMs: replaceOrKeep(d.lastGapMs, base.lastGapMs),
    avgGapMs: replaceOrKeep(d.avgGapMs, base.avgGapMs),
    lastDeliveryGapMs: replaceOrKeep(d.lastDeliveryGapMs, base.lastDeliveryGapMs),
    avgDeliveryGapMs: replaceOrKeep(d.avgDeliveryGapMs, base.avgDeliveryGapMs),
    lastEventAt: replaceOrKeep(d.lastEventAt, base.lastEventAt)
  };
}

/** @param {Partial<InstantPushDiagState>|null|undefined} diag @returns {InstantPushDiagState} */
function buildInstantPushDiagSnapshotInternal(diag) {
  const base = makeInitialInstantPushDiag();
  const d = /** @type {any} */ (diag && typeof diag === 'object' ? diag : {});
  /** @param {unknown} x @param {number} fallback @returns {number} */
  const num = (x, fallback) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    sentCount: num(d.sentCount, base.sentCount),
    sentRows: num(d.sentRows, base.sentRows),
    receivedCount: num(d.receivedCount, base.receivedCount),
    receivedRows: num(d.receivedRows, base.receivedRows),
    rejectedCount: num(d.rejectedCount, base.rejectedCount),
    paintedRows: num(d.paintedRows, base.paintedRows),
    lastGapMs: num(d.lastGapMs, base.lastGapMs),
    avgGapMs: num(d.avgGapMs, base.avgGapMs),
    lastDeliveryGapMs: num(d.lastDeliveryGapMs, base.lastDeliveryGapMs),
    avgDeliveryGapMs: num(d.avgDeliveryGapMs, base.avgDeliveryGapMs),
    lastEventAt: num(d.lastEventAt, base.lastEventAt)
  };
}

/**
 * storage 書き込み用の軽量スナップショット(欠損は初期値で埋める)。既存 storage 値との
 *   read-merge-write を呼び出し側で行う前提の「不足フィールドを補う」正規化。
 * @param {Partial<InstantPushDiagState>|null|undefined} diag
 * @param {number} [nowMs]
 * @returns {InstantPushDiagState & { capturedAt: number }}
 */
export function buildInstantPushDiagSnapshot(diag, nowMs) {
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  return { ...buildInstantPushDiagSnapshotInternal(diag), capturedAt: now };
}

/**
 * 状態速報に出す行群を作る純関数。一度もプッシュイベントが無ければ空配列
 * (ノイズにしない・commentPostDiag.js と同方針)。
 * @param {(InstantPushDiagState & { capturedAt?: number })|null|undefined} snap
 * @param {number} nowMs 現在時刻(最終イベント ago の算出用)
 * @returns {string[]}
 */
export function buildInstantPushDiagLines(snap, nowMs) {
  if (!snap || typeof snap !== 'object') return [];
  const sentRows = Number(snap.sentRows) || 0;
  const receivedRows = Number(snap.receivedRows) || 0;
  if (sentRows === 0 && receivedRows === 0) return []; // 未観測=このセッションでプッシュが無かった
  const sentCount = Number(snap.sentCount) || 0;
  const receivedCount = Number(snap.receivedCount) || 0;
  const rejectedCount = Number(snap.rejectedCount) || 0;
  const paintedRows = Number(snap.paintedRows) || 0;
  const lastGapMs = Number(snap.lastGapMs);
  const avgGapMs = Number(snap.avgGapMs);
  const avgDeliveryGapMs = Number(snap.avgDeliveryGapMs);
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const lastAt = Number(snap.lastEventAt) || 0;
  const agoText = lastAt > 0 && now > 0 ? ` / 最終${Math.max(0, Math.round((now - lastAt) / 1000))}秒前` : '';
  const gapText =
    Number.isFinite(lastGapMs) && lastGapMs >= 0
      ? `表示遅延 直近${lastGapMs}ms${Number.isFinite(avgGapMs) && avgGapMs >= 0 ? `(平均${avgGapMs}ms)` : ''}`
      : '表示遅延 未計測';
  const lines = [
    `即時プッシュ: 送信${sentCount}件(行${sentRows}) / 受信${receivedCount}件(行${receivedRows}) / 破棄${rejectedCount} / 表示反映${paintedRows}行${agoText}`,
    `  → ${gapText}`
  ];
  // robust-arch Phase 0: 配達(送信→受信) と 描画(受信→描画完了) の内訳を1行で見せる。
  //   どちらが支配的かで MVP 後の次の一手が数値で決まる(嘘をつかないため未計測は出さない)。
  if (Number.isFinite(avgDeliveryGapMs) && avgDeliveryGapMs >= 0) {
    const paintPart =
      Number.isFinite(avgGapMs) && avgGapMs >= 0
        ? ` / 描画平均${Math.max(0, avgGapMs - avgDeliveryGapMs)}ms`
        : '';
    lines.push(`  → 内訳: 配達平均${avgDeliveryGapMs}ms${paintPart}`);
  }
  return lines;
}

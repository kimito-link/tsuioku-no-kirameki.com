// liveViewPublishSignature.js
// 状態速報「重さ根治 P4」: publishLiveViewPublishPayload(status-entry.js)は 3秒 min-gap を
//   通過するたび、内容が同じでも約131KB級の jsonBlob を丸ごと chrome.storage.local.set する。
//   131KB の JSON.stringify 比較はそれ自体が重いので行わず、「中身が変わったらほぼ必ず動く」
//   軽量フィールド(各鏡の capturedAt・lives件数・記録数合計・overview 文字列長)だけを
//   '|' 連結した文字列シグネチャで代用する純関数。
//
// 設計方針:
//   - null/undefined 安全(jsonBlob 自体や各鏡フィールドが欠けていても例外を投げない)。
//   - 完全性(誤検知ゼロ)は狙わない。3秒 min-gap 通過後の「明らかに同じ」を弾く軽量フィルタ。
//   - 呼び出し側(publishLiveViewPublishPayload)の既存 min-gap 判定・タイマー更新条件は一切変えない。

/**
 * @param {Record<string, unknown>|null|undefined} jsonBlob publishLiveViewPublishPayload に渡される公開ペイロード
 * @returns {string} 軽量シグネチャ('|' 連結)。jsonBlob が無ければ空文字。
 */
export function buildLiveViewPublishSignature(jsonBlob) {
  if (!jsonBlob || typeof jsonBlob !== 'object') return '';

  const b = /** @type {Record<string, unknown>} */ (jsonBlob);
  /** @param {unknown} mirror */
  const capturedAtOf = (mirror) =>
    mirror && typeof mirror === 'object' ? Number(/** @type {Record<string, unknown>} */ (mirror).capturedAt) || 0 : 0;

  const snapshotMeta = /** @type {Record<string, unknown>|undefined} */ (b.snapshotMeta);
  const snapshotCapturedAt =
    snapshotMeta && typeof snapshotMeta === 'object' ? Number(snapshotMeta.capturedAt) || 0 : 0;
  const laneCapturedAt = capturedAtOf(b.laneMirror);
  const statCardsCapturedAt = capturedAtOf(b.statCardsMirror);
  const northStarCapturedAt = capturedAtOf(b.northStarMirror);
  const commentTimelineCapturedAt = capturedAtOf(b.commentTimelineMirror);

  const lives = Array.isArray(b.lives) ? b.lives : [];
  const livesCount = lives.length;
  let recordedSum = 0;
  for (const live of lives) {
    const rec = live && typeof live === 'object' ? /** @type {Record<string, unknown>} */ (live) : null;
    recordedSum += (rec && Number(rec.recordedCount)) || 0;
  }

  const overviewLen = typeof b.overview === 'string' ? b.overview.length : 0;

  return [
    snapshotCapturedAt,
    laneCapturedAt,
    statCardsCapturedAt,
    northStarCapturedAt,
    commentTimelineCapturedAt,
    livesCount,
    recordedSum,
    overviewLen
  ].join('|');
}

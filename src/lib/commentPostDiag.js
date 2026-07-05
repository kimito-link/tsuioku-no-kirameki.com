/**
 * コメント送信(requestPostCommentToOpenTab)の「所要ms/結果/リトライ回数」観測値を
 * 組み立てる純関数群。記録/演出/音には一切触れない(opSoundEffectDiag.js /
 * voiceEffectDiag.js と同思想=popup-entry.js が書き、status が読んで状態速報に再表示する)。
 *
 * 目的(2026-07-06実機症状): 「送信中…」が長時間張り付く / 自コメが「一瞬載って消える」の
 * 切り分けに、総所要ms・結果種別(ok/fail/timeout)・フレーム試行回数を状態速報1枚で
 * 確認できるようにする。
 *
 * **嘘をつかない**: `timeout` は総締切(commentPostDeadline.js)超過を指し、`fail` とは
 * 別カウントにする(「不明」を「失敗」と混同しない)。
 *
 * @typedef {{
 *   attempts: number,      // 送信操作の試行回数(submitComment→requestPostCommentToOpenTab 呼び出し回数)
 *   okCount: number,       // result.ok===true だった回数
 *   failCount: number,     // 明確な失敗(ok===false かつ timedOut でない)だった回数
 *   timeoutCount: number,  // 総締切超過(timedOut===true)だった回数
 *   revertCount: number,   // revertLastSelfPostedComment を実行した回数
 *   totalRetryAttempts: number, // tryPostOnFrame 呼び出し回数の累計(フレーム試行回数)
 *   lastTotalMs: number,   // 直近1回の総所要ms
 *   lastOutcome: string,   // 直近1回の結果種別('ok'|'fail'|'timeout'|'')
 *   lastEventAt: number    // 最後にイベントが起きた時刻(epoch ms・0=未観測)
 * }} CommentPostDiagState
 */

/** 初期 コメント送信診断 state。 */
export function makeInitialCommentPostDiag() {
  return {
    attempts: 0,
    okCount: 0,
    failCount: 0,
    timeoutCount: 0,
    revertCount: 0,
    totalRetryAttempts: 0,
    lastTotalMs: 0,
    lastOutcome: '',
    lastEventAt: 0
  };
}

/**
 * requestPostCommentToOpenTab の結果から結果種別を分類する純関数(嘘をつかない集計の核)。
 * @param {{ ok?: boolean, timedOut?: boolean }|null|undefined} result
 * @returns {'ok'|'fail'|'timeout'}
 */
export function commentPostOutcomeKindForResult(result) {
  if (result && result.ok === true) return 'ok';
  if (result && result.timedOut === true) return 'timeout';
  return 'fail';
}

/**
 * storage 書き込み用の軽量スナップショット(欠損は初期値で埋める)。
 * @param {Partial<CommentPostDiagState>|null|undefined} diag
 * @param {number} [nowMs]
 * @returns {CommentPostDiagState & { capturedAt: number }}
 */
export function buildCommentPostDiagSnapshot(diag, nowMs) {
  const base = makeInitialCommentPostDiag();
  const d = /** @type {any} */ (diag && typeof diag === 'object' ? diag : {});
  /** @param {unknown} x @param {number} fallback @returns {number} */
  const num = (x, fallback) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
  };
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  return {
    attempts: num(d.attempts, base.attempts),
    okCount: num(d.okCount, base.okCount),
    failCount: num(d.failCount, base.failCount),
    timeoutCount: num(d.timeoutCount, base.timeoutCount),
    revertCount: num(d.revertCount, base.revertCount),
    totalRetryAttempts: num(d.totalRetryAttempts, base.totalRetryAttempts),
    lastTotalMs: num(d.lastTotalMs, base.lastTotalMs),
    lastOutcome: String(d.lastOutcome || ''),
    lastEventAt: num(d.lastEventAt, base.lastEventAt),
    capturedAt: now
  };
}

/**
 * 状態速報に出す行群を作る純関数。一度も送信イベントが無ければ空配列
 * (ノイズにしない・opSoundEffectDiag.js と同方針)。
 * @param {(CommentPostDiagState & { capturedAt?: number })|null|undefined} snap
 * @param {number} nowMs 現在時刻(最終イベント ago の算出用)
 * @returns {string[]}
 */
export function buildCommentPostDiagLines(snap, nowMs) {
  if (!snap || typeof snap !== 'object') return [];
  const attempts = Number(snap.attempts) || 0;
  if (attempts === 0) return []; // 未観測=このセッションで送信操作が無かった
  const okCount = Number(snap.okCount) || 0;
  const failCount = Number(snap.failCount) || 0;
  const timeoutCount = Number(snap.timeoutCount) || 0;
  const revertCount = Number(snap.revertCount) || 0;
  const totalRetryAttempts = Number(snap.totalRetryAttempts) || 0;
  const lastTotalMs = Number(snap.lastTotalMs) || 0;
  const lastOutcome = String(snap.lastOutcome || '');
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const lastAt = Number(snap.lastEventAt) || 0;
  const agoText = lastAt > 0 && now > 0 ? ` / 最終${Math.max(0, Math.round((now - lastAt) / 1000))}秒前` : '';
  const lastOutcomeText = lastOutcome ? `(${lastOutcome})` : '';
  const lines = [];
  lines.push(
    `コメント送信: 試行${attempts} / 成功${okCount} / 失敗${failCount} / 締切超過${timeoutCount}${agoText}${lastOutcomeText}`
  );
  lines.push(
    `  → 直近所要${lastTotalMs}ms / フレーム試行累計${totalRetryAttempts} / 取消${revertCount}`
  );
  return lines;
}

/**
 * コメント送信(requestPostCommentToOpenTab)の「所要ms/結果/リトライ回数」観測値を
 * 組み立てる純関数群。記録/演出/音には一切触れない(opSoundEffectDiag.js /
 * voiceEffectDiag.js と同思想=popup-entry.js が書き、status が読んで状態速報に再表示する)。
 *
 * 目的(2026-07-06実機症状): 「送信中…」が長時間張り付く / 自コメが「一瞬載って消える」の
 * 切り分けに、総所要ms・結果種別(ok/fail/timeout)・フレーム試行回数を状態速報1枚で
 * 確認できるようにする。
 *
 * 目的追加(2026-07-06「自分のコメントの感度」実測要望): 送信応答(lastTotalMs)だけでは
 * 「押してから画面に本当に載る(ndgr 実フィード到着で確定する)まで」の体感が測れない。
 * pending-self エントリ(楽観表示)が実フィードの本物 entry と照合できた瞬間までの
 * echoMs を voicePlayer.js の computeVoiceE2eAverage と同じ EMA 方式で追加する。
 *
 * **嘘をつかない**: `timeout` は総締切(commentPostDeadline.js)超過を指し、`fail` とは
 * 別カウントにする(「不明」を「失敗」と混同しない)。echo は「照合が成立した時だけ」記録し、
 * revert・期限切れ(TTL)で消えた pending は記録しない(不明を実着と偽らない)。
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
 *   lastEventAt: number,   // 最後にイベントが起きた時刻(epoch ms・0=未観測)
 *   lastEchoMs: number,    // 直近1回の「押下→実フィード到着確定(echo)」ms(-1=未計測)
 *   avgEchoMs: number      // echo の EMA 平均ms(-1=未計測)
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
    lastEventAt: 0,
    lastEchoMs: -1,
    avgEchoMs: -1
  };
}

/**
 * 「押下→実フィード到着確定(echo)」のEMA平均を求める純関数。giftEffectDiag.js の
 *   computeGiftGapAverage / voiceReadQueue.js の computeVoiceE2eAverage と同じ考え方
 *   (窓バッファ無し=メモリ有界・純粋・負値/非数は「未計測」として直前値を素通しする)。
 * @param {unknown} prevAvgMs 直前の平均値(-1=未計測)
 * @param {unknown} sampleMs 今回の実測値(ms)
 * @param {number} [alpha] EMA係数(既定0.3)
 * @returns {number} 更新後の平均値(ms・整数丸め)
 */
export function computeCommentEchoAverage(prevAvgMs, sampleMs, alpha = 0.3) {
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
    lastEchoMs: num(d.lastEchoMs, base.lastEchoMs),
    avgEchoMs: num(d.avgEchoMs, base.avgEchoMs),
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
    `コメント送信: 試行${attempts}(ok${okCount}/失敗${failCount}/締切${timeoutCount})${agoText}${lastOutcomeText}`
  );
  // 感度実測(2026-07-06追加): 送信応答(押下→requestPostCommentToOpenTab 応答)と、
  //   画面反映(echo=押下→実フィード到着で照合確定するまで)を分けて出す。
  //   レーン自体は楽観表示で押下と同時に載るため、echo は「本物の到着確認」を指す
  //   ことが分かるよう「実着」の語で区別する(嘘をつかない=見た目の速さと実着を混同しない)。
  const lastEchoMs = Number(snap.lastEchoMs);
  const avgEchoMs = Number(snap.avgEchoMs);
  const echoText =
    Number.isFinite(lastEchoMs) && lastEchoMs >= 0
      ? ` / 画面実着(echo) 直近${(lastEchoMs / 1000).toFixed(1)}秒${
          Number.isFinite(avgEchoMs) && avgEchoMs >= 0 ? `(平均${(avgEchoMs / 1000).toFixed(1)}秒)` : ''
        }`
      : '';
  lines.push(
    `  → 送信応答 直近${(lastTotalMs / 1000).toFixed(1)}秒${echoText} / フレーム試行累計${totalRetryAttempts} / 取消${revertCount}`
  );
  return lines;
}

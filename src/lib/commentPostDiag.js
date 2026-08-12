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
 *   avgEchoMs: number,     // echo の EMA 平均ms(-1=未計測)
 *   lastOptimisticPaintMs: number, // 直近1回の「押下→楽観表示(pending-self)がレーンに描画完了」ms(-1=未計測。echoとは別物=体感速度の直接指標)
 *   avgOptimisticPaintMs: number,  // 楽観表示描画の EMA 平均ms(-1=未計測)
 *   instantPaintRuns: number       // scheduleImmediate(即時paint)が実行された累計回数(Phase 1導入前は常に0)
 * }} CommentPostDiagState
 */

import { makeInitialFromSchema } from './diagSchemaCopy.js';

/**
 * ★フィールド表(唯一の正本)。HANDOFF-instrument-channels-2026-08-12.md §2 の必須5点セット①。
 *   makeInitialCommentPostDiag はこの表から機械生成する(v1349 で導入・値は移行前と同一)。
 *
 * ★kind の使い分け: 'ms' は既定 -1(未計測)。「0=観測して0ms」と区別するため。
 *   ただし lastTotalMs だけは移行前から既定 0 だったので default:0 を明示して**挙動同値**を保つ
 *   (ここを -1 に変えると行の文言が変わる=v1349 の「挙動変更ゼロ」を破る。
 *    意味の是正が要るなら別版で、ゴールデン出力の差分とセットで行うこと)。
 *   lastEventAt も「時点(epoch)」であり所要msではないので既定 0。
 *
 * @type {import('./diagSchemaCopy.js').DiagSchema}
 */
export const COMMENT_POST_DIAG_SCHEMA = [
  { name: 'attempts', kind: 'count' },
  { name: 'okCount', kind: 'count' },
  { name: 'failCount', kind: 'count' },
  { name: 'timeoutCount', kind: 'count' },
  { name: 'revertCount', kind: 'count' },
  { name: 'totalRetryAttempts', kind: 'count' },
  { name: 'lastTotalMs', kind: 'ms', default: 0 },
  { name: 'lastOutcome', kind: 'text' },
  { name: 'lastEventAt', kind: 'count', default: 0 },
  { name: 'lastEchoMs', kind: 'ms' },
  { name: 'avgEchoMs', kind: 'ms' },
  { name: 'lastOptimisticPaintMs', kind: 'ms' },
  { name: 'avgOptimisticPaintMs', kind: 'ms' },
  { name: 'instantPaintRuns', kind: 'count' }
];

/** 初期 コメント送信診断 state(schema から機械生成)。 */
export function makeInitialCommentPostDiag() {
  return /** @type {CommentPostDiagState} */ (
    /** @type {unknown} */ (makeInitialFromSchema(COMMENT_POST_DIAG_SCHEMA))
  );
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
 * comment-post-speed-DESIGN.md §F: 「押下→楽観表示(pending-self)がレーンに描画完了」の
 *   サンプルを、押下時刻の記録(marks)と今回の paint で実際に表示された pending-self の
 *   at 集合(displayedPendingAts)を突合して取り出す純関数。
 *
 * 嘘をつかない: 照合が成立した mark だけを sample 化する。revert・TTL失効で表示されなかった
 *   mark はここでは捨てる(remaining に残らない=次回以降も対象外)。「表示されなかったのに
 *   楽観表示が速かった」と偽らない。
 *
 * @param {ReadonlyArray<{ at: number }>} marks 押下時刻の記録(呼び出し側が submitComment 時に積む)
 * @param {ReadonlySet<number>|ReadonlyArray<number>} displayedPendingAts 今回の paint で実際に
 *   画面に表示された pending-self エントリの at 値集合
 * @param {number} nowMs 現在時刻(サンプル値=nowMs - mark.at)
 * @returns {{ samples: number[], remaining: Array<{ at: number }> }}
 */
export function takeOptimisticPaintSamples(marks, displayedPendingAts, nowMs) {
  const list = Array.isArray(marks) ? marks : [];
  const displayed =
    displayedPendingAts instanceof Set
      ? displayedPendingAts
      : new Set(Array.isArray(displayedPendingAts) ? displayedPendingAts : []);
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  /** @type {number[]} */
  const samples = [];
  /** @type {Array<{ at: number }>} */
  const remaining = [];
  for (const m of list) {
    const at = Number(m?.at);
    if (!Number.isFinite(at)) continue;
    if (displayed.has(at)) {
      samples.push(Math.max(0, now - at));
    } else {
      remaining.push({ at });
    }
  }
  return { samples, remaining };
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
    lastOptimisticPaintMs: num(d.lastOptimisticPaintMs, base.lastOptimisticPaintMs),
    avgOptimisticPaintMs: num(d.avgOptimisticPaintMs, base.avgOptimisticPaintMs),
    instantPaintRuns: num(d.instantPaintRuns, base.instantPaintRuns),
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
  // comment-post-speed-DESIGN.md §F/§G(Phase 0): 「押下→楽観表示がレーンに描画完了」の実測。
  //   echo(本物到着)と違い、これがユーザー体感の「反応速度」の直接指標。Phase 1(即時paint)
  //   導入前後の効果をこの値のbefore/afterで実証する。未計測(-1)ならノイズにしない=行を出さない。
  const lastOptimisticPaintMs = Number(snap.lastOptimisticPaintMs);
  const avgOptimisticPaintMs = Number(snap.avgOptimisticPaintMs);
  const instantPaintRuns = Number(snap.instantPaintRuns) || 0;
  if (Number.isFinite(lastOptimisticPaintMs) && lastOptimisticPaintMs >= 0) {
    const avgText =
      Number.isFinite(avgOptimisticPaintMs) && avgOptimisticPaintMs >= 0
        ? `(平均${(avgOptimisticPaintMs / 1000).toFixed(1)}秒)`
        : '';
    lines.push(
      `  → 楽観表示 直近${(lastOptimisticPaintMs / 1000).toFixed(1)}秒${avgText} / 即時paint${instantPaintRuns}回`
    );
  }
  return lines;
}

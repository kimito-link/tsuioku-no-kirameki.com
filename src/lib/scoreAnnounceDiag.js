/**
 * 結果発表シーケンス(scoreAnnounce.js・SC3・council/broadcast-scoring-SYNTHESIS.md §2.1)の
 * 「実行回数/完走/中断」観測値を組み立てる純関数群。記録/演出/音には一切触れない
 * (opSoundEffectDiag.js / bgmPhaseDiag.js と同思想=popup-entry.js が書き、
 * status が読んで状態速報に再表示する)。
 *
 * **嘘をつかない**: `completedCount` は最終ステップの action が実際に実行された(=setTimeoutの
 *   コールバックまで到達した)ときだけ加算する。`abortedCount` は二重起動ガードで弾かれた回数・
 *   実行途中で discard された回数の両方を含む(内訳は lastAbortReason で見分ける)。
 *
 * @typedef {{
 *   startedCount: number,      // 発表シーケンスを開始した回数(自動/手動の合算)
 *   autoStartedCount: number,  // うち配信終了フラグによる自動起動の回数
 *   manualStartedCount: number,// うち「▶発表を再生」ボタンによる手動起動の回数
 *   completedCount: number,    // 最終ステップまで実行された回数(=完走)
 *   abortedCount: number,      // 二重起動ガード/中断で終わった回数
 *   lastAbortReason: string,   // 直近の中断理由('already_running'等・空=中断なし)
 *   lastLiveId: string,        // 直近に発表したliveId
 *   lastRank: string,          // 直近発表のランク(S/A/B/C/D・空=未実行)
 *   lastEventAt: number        // 最後にイベントが起きた時刻(epoch ms・0=未観測)
 * }} ScoreAnnounceDiagState
 */

/** 初期 結果発表シーケンス診断 state。 */
export function makeInitialScoreAnnounceDiag() {
  return {
    startedCount: 0,
    autoStartedCount: 0,
    manualStartedCount: 0,
    completedCount: 0,
    abortedCount: 0,
    lastAbortReason: '',
    lastLiveId: '',
    lastRank: '',
    lastEventAt: 0
  };
}

/**
 * storage 書き込み用の軽量スナップショット(欠損は初期値で埋める)。
 * @param {Partial<ScoreAnnounceDiagState>|null|undefined} diag
 * @param {number} [nowMs]
 * @returns {ScoreAnnounceDiagState & { capturedAt: number }}
 */
export function buildScoreAnnounceDiagSnapshot(diag, nowMs) {
  const base = makeInitialScoreAnnounceDiag();
  const d = /** @type {any} */ (diag && typeof diag === 'object' ? diag : {});
  /** @param {unknown} x @param {number} fallback @returns {number} */
  const num = (x, fallback) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
  };
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  return {
    startedCount: num(d.startedCount, base.startedCount),
    autoStartedCount: num(d.autoStartedCount, base.autoStartedCount),
    manualStartedCount: num(d.manualStartedCount, base.manualStartedCount),
    completedCount: num(d.completedCount, base.completedCount),
    abortedCount: num(d.abortedCount, base.abortedCount),
    lastAbortReason: String(d.lastAbortReason || ''),
    lastLiveId: String(d.lastLiveId || ''),
    lastRank: String(d.lastRank || ''),
    lastEventAt: num(d.lastEventAt, base.lastEventAt),
    capturedAt: now
  };
}

/**
 * 状態速報に出す行群を作る純関数。一度も発表イベントが無ければ空配列
 * (ノイズにしない・opSoundEffectDiag.js と同方針)。
 * @param {(ScoreAnnounceDiagState & { capturedAt?: number })|null|undefined} snap
 * @param {number} nowMs 現在時刻(最終イベント ago の算出用)
 * @returns {string[]}
 */
export function buildScoreAnnounceDiagLines(snap, nowMs) {
  if (!snap || typeof snap !== 'object') return [];
  const startedCount = Number(snap.startedCount) || 0;
  if (startedCount === 0) return []; // 未観測=このセッションで発表シーケンスが一度も起動していない
  const autoStartedCount = Number(snap.autoStartedCount) || 0;
  const manualStartedCount = Number(snap.manualStartedCount) || 0;
  const completedCount = Number(snap.completedCount) || 0;
  const abortedCount = Number(snap.abortedCount) || 0;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const lastAt = Number(snap.lastEventAt) || 0;
  const agoText = lastAt > 0 && now > 0 ? ` / 最終${Math.max(0, Math.round((now - lastAt) / 1000))}秒前` : '';
  const rankText = snap.lastRank ? `(ランク${snap.lastRank})` : '';
  const abortReasonText = abortedCount > 0 && snap.lastAbortReason ? ` / 中断理由=${snap.lastAbortReason}` : '';
  const lines = [];
  lines.push(`配信採点 結果発表: 起動${startedCount}(自動${autoStartedCount}/手動${manualStartedCount})${agoText}${rankText}`);
  lines.push(`  → 完走${completedCount} / 中断${abortedCount}${abortReasonText}`);
  return lines;
}

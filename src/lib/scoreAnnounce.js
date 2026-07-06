/**
 * 配信採点「結果発表シーケンス」の純関数プランナー(council/broadcast-scoring-SYNTHESIS.md
 * §2.1・SC3)。
 *
 * ドラムロール→カウントアップ→ジャーン+(A/Sランク時)拍手/Sジングル→講評レーダー→
 * ハイライト3選、を**全ステップ固定遅延の直列チェーン**として計画する(乱数禁止)。
 * `planJackpotChain`(voiceDirector.js)と同じ形の `{ kind, delayMs }` 配列を返す
 * step-list方式を踏襲しつつ、視覚アクション(action)も一緒に持たせる。
 *
 * 呼び出し側(popup-entry.js)は `atMs`(=開始からの絶対経過時間。累積計算済み)で
 * 直列に setTimeout を積むだけの薄い実行器にする(このファイルは純関数のみ・DOM/音を鳴らさない)。
 *
 * @typedef {'sound'|'visual'} ScoreAnnounceStepType
 * @typedef {'drumroll_start'|'count_up_start'|'result_reveal'|'applause'|'jingle_s'|'radar_reveal'|'highlight_1'|'highlight_2'|'highlight_3'} ScoreAnnounceAction
 * @typedef {{ atMs: number, type: ScoreAnnounceStepType, kind: string, action: ScoreAnnounceAction }} ScoreAnnounceStep
 */

/** ①ドラムロールの尺(ms・§2.1「約2秒」)。 */
export const SCORE_ANNOUNCE_DRUMROLL_MS = 2000;
/** ②カウントアップの尺(ms・scoreCountUp.js の既定値と同値=SC2から流用)。 */
export const SCORE_ANNOUNCE_COUNT_UP_MS = 1600;
/** ②カウントアップ内 score_tick の間引き間隔(ms・scoreCountUp.js の shouldPlayScoreTick 既定と同値)。 */
export const SCORE_ANNOUNCE_TICK_INTERVAL_MS = 90;
/** ③ジャーン→拍手までの直列間隔(ms・§2.1「+400ms」)。 */
export const SCORE_ANNOUNCE_RESULT_TO_APPLAUSE_MS = 400;
/** 拍手→Sジングルまでの直列間隔(ms・拍手の尺を見込む固定値)。 */
export const SCORE_ANNOUNCE_APPLAUSE_TO_JINGLE_MS = 900;
/** ③(拍手/ジングル含む)→④講評レーダーの遷移までの間隔(ms・§2.1「1.0秒で描き起こす」の開始オフセット)。 */
export const SCORE_ANNOUNCE_RESULT_TO_RADAR_MS = 1200;
/** ④講評レーダーの描画尺(ms・§2.1「1.0秒」)。 */
export const SCORE_ANNOUNCE_RADAR_DURATION_MS = 1000;
/** ⑤ハイライト各行のスライドイン間隔(ms・§2.1「+300ms間隔・3回」)。 */
export const SCORE_ANNOUNCE_HIGHLIGHT_INTERVAL_MS = 300;

/** A/Sランク判定(拍手・§2.1「rank A/S のときだけ」)。 */
const APPLAUSE_RANKS = Object.freeze(['A', 'S']);

/**
 * @param {{ rank?: string }|null|undefined} score computeBroadcastScoreV2 の戻り値(rankのみ使用)。
 * @param {import('./scoreRadar.js').ScoreRadar|null|undefined} radar buildScoreRadar の戻り値
 *   (このプランナーは有無だけ見る。軸の中身はradar_reveal実行側=拡張/Web双方が描画側で読む)。
 * @param {import('./highlightLedger.js').HighlightRow[]|null|undefined} highlights
 *   pickTopHighlights の戻り値(最大3件・順序は既に確定済み)。
 * @returns {ScoreAnnounceStep[]} atMs昇順の固定シーケンス(乱数なし・同じ入力には常に同じ結果)。
 */
export function planScoreAnnounce(score, radar, highlights) {
  const rank = String(score && typeof score === 'object' ? score.rank || '' : '');
  const hasRadar = !!(radar && typeof radar === 'object' && Array.isArray(radar.axes) && radar.axes.length > 0);
  const rows = Array.isArray(highlights) ? highlights.slice(0, 3) : [];

  /** @type {ScoreAnnounceStep[]} */
  const steps = [];

  // ①ドラムロール。
  steps.push({ atMs: 0, type: 'sound', kind: 'score_drumroll', action: 'drumroll_start' });

  // ②カウントアップ開始(score_tickの連続再生は実行側がonTickから間引き再生する。
  //   このプランナーには「開始タイミング」だけを1ステップとして載せる)。
  const countUpStartAt = SCORE_ANNOUNCE_DRUMROLL_MS;
  steps.push({ atMs: countUpStartAt, type: 'visual', kind: 'score_tick', action: 'count_up_start' });

  // ③ジャーン(カウントアップ完了と同フレーム)。
  const resultAt = countUpStartAt + SCORE_ANNOUNCE_COUNT_UP_MS;
  steps.push({ atMs: resultAt, type: 'sound', kind: 'score_result', action: 'result_reveal' });

  // ③' rank A/S のときだけ拍手+400ms直列(§2.1)。Sランクはさらに+900ms後にジングル。
  let radarBaseAt = resultAt + SCORE_ANNOUNCE_RESULT_TO_RADAR_MS;
  if (APPLAUSE_RANKS.includes(rank)) {
    const applauseAt = resultAt + SCORE_ANNOUNCE_RESULT_TO_APPLAUSE_MS;
    steps.push({ atMs: applauseAt, type: 'sound', kind: 'score_applause', action: 'applause' });
    if (rank === 'S') {
      const jingleAt = applauseAt + SCORE_ANNOUNCE_APPLAUSE_TO_JINGLE_MS;
      steps.push({ atMs: jingleAt, type: 'sound', kind: 'score_jingle_s', action: 'jingle_s' });
      // レーダーはジングルの後ろに回す(演出の重なりを避ける・直列の原則)。
      radarBaseAt = jingleAt + SCORE_ANNOUNCE_RESULT_TO_RADAR_MS;
    } else {
      radarBaseAt = applauseAt + SCORE_ANNOUNCE_RESULT_TO_RADAR_MS;
    }
  }

  // ④講評レーダー(音なし・§2.1)。radarが無ければステップ自体を積まない(空描画をしない)。
  let highlightBaseAt = radarBaseAt;
  if (hasRadar) {
    steps.push({ atMs: radarBaseAt, type: 'visual', kind: '', action: 'radar_reveal' });
    highlightBaseAt = radarBaseAt + SCORE_ANNOUNCE_RADAR_DURATION_MS;
  }

  // ⑤ハイライト3選(score_swooshで1行ずつスライドイン・§2.1)。
  const highlightActions = /** @type {const} */ (['highlight_1', 'highlight_2', 'highlight_3']);
  rows.forEach((_row, i) => {
    steps.push({
      atMs: highlightBaseAt + SCORE_ANNOUNCE_HIGHLIGHT_INTERVAL_MS * i,
      type: 'sound',
      kind: 'score_swoosh',
      action: highlightActions[i]
    });
  });

  return steps;
}

/**
 * シーケンス全体の所要時間(ms・最終ステップのatMs。実行側が「完走」判定に使える)。
 * @param {ScoreAnnounceStep[]|null|undefined} steps planScoreAnnounce の戻り値。
 * @returns {number} 空配列/未指定は0。
 */
export function scoreAnnounceTotalDurationMs(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return 0;
  return steps.reduce((max, s) => Math.max(max, Number(s?.atMs) || 0), 0);
}

/* ============================================================================
 * 二重起動ガード(純関数・§2.1「1配信1回きり」+ 二重起動ガード)。
 * ========================================================================== */

/**
 * @typedef {{ runningLiveId: string, playedLiveIds: string[] }} ScoreAnnounceGateState
 */

/**
 * 初期ガードstate。
 * @returns {ScoreAnnounceGateState}
 */
export function makeInitialScoreAnnounceGateState() {
  return { runningLiveId: '', playedLiveIds: /** @type {string[]} */ ([]) };
}

/**
 * 発表シーケンスを起動してよいかを判定する純関数。
 *   - 同一プロセス内で既に実行中(runningLiveId が空でない)なら常に拒否(二重起動ガード)。
 *   - `trigger==='auto'`(配信終了フラグ由来)は「1配信1回きり」= playedLiveIds に既にあれば拒否。
 *   - `trigger==='manual'`(ボタン)は実行中でなければ何度でも許可(ユーザーの明示操作は尊重)。
 * @param {ScoreAnnounceGateState} state
 * @param {string} liveId
 * @param {'auto'|'manual'} trigger
 * @returns {{ allowed: boolean, reason: string, nextState: ScoreAnnounceGateState }}
 */
export function scoreAnnounceGate(state, liveId, trigger) {
  const s = state && typeof state === 'object' ? state : makeInitialScoreAnnounceGateState();
  const lid = String(liveId || '').trim().toLowerCase();
  const playedLiveIds = Array.isArray(s.playedLiveIds) ? s.playedLiveIds : [];
  if (!lid) {
    return { allowed: false, reason: 'no_live_id', nextState: s };
  }
  if (s.runningLiveId) {
    return { allowed: false, reason: 'already_running', nextState: s };
  }
  if (trigger === 'auto' && playedLiveIds.includes(lid)) {
    return { allowed: false, reason: 'already_played', nextState: s };
  }
  return {
    allowed: true,
    reason: '',
    nextState: { runningLiveId: lid, playedLiveIds }
  };
}

/**
 * 発表シーケンス終了(完走/中断いずれも)を記録する純関数。実行中フラグを下ろし、
 *   auto起動だった場合のみ playedLiveIds に追記する(1配信1回きりの対象は自動起動のみ・
 *   手動再生は何度でも見返せる)。
 * @param {ScoreAnnounceGateState} state
 * @param {string} liveId
 * @param {'auto'|'manual'} trigger
 * @returns {ScoreAnnounceGateState}
 */
export function scoreAnnounceGateFinish(state, liveId, trigger) {
  const s = state && typeof state === 'object' ? state : makeInitialScoreAnnounceGateState();
  const lid = String(liveId || '').trim().toLowerCase();
  const playedLiveIds = Array.isArray(s.playedLiveIds) ? s.playedLiveIds.slice() : [];
  if (trigger === 'auto' && lid && !playedLiveIds.includes(lid)) playedLiveIds.push(lid);
  return { runningLiveId: '', playedLiveIds };
}

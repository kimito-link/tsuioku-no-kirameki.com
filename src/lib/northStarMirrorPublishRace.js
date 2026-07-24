/**
 * northStarMirrorPublishRace.js — 北極星鏡publish取りこぼしの実害確定計器(診断先行アプローチ)。
 *
 * 背景: ユーザー実機報告「①POP内部では貢献度3件・広告7件のデータがあるのに、③純Web公開用の鏡
 *   (storage)には0件しか反映されていない」。応援レーン鏡・数字カード鏡も同時に空だった。
 *
 *   コード読解の結果、最有力仮説は「refreshAllNorthStarMirrorLanes(popup-entry.js)の多重並行実行に
 *   よる合流バッファ(_northStarMirrorLanes)競合」。呼び出し元 tickIndependentNorthStar は
 *   init時同期1回+400ms/1500ms/4000ms後のsetTimeout+6000ms間隔のsetInterval+storage.onChangedの
 *   たびに awaitせず多重発火する設計で、23秒間で最低6〜7回の並行呼び出しが起きうる。
 *
 *   本モジュールは「直す」のではなく「実害の有無・頻度を数える」ことだけが目的(観測のみ)。
 *   掟(venueSeatLinkParity.js等と同じ): 数えるだけ・DOM/データを一切触らない。
 *
 * @module northStarMirrorPublishRace
 */

/**
 * @returns {{ inflight: number, inflightMax: number, publishCalls: number,
 *   liveIdReset: number, flushSuccess: number, flushSkipped: number }}
 */
export function createNorthStarMirrorPublishRaceState() {
  return {
    inflight: 0,
    inflightMax: 0,
    publishCalls: 0,
    liveIdReset: 0,
    flushSuccess: 0,
    flushSkipped: 0
  };
}

/**
 * refreshAllNorthStarMirrorLanes の開始時に呼ぶ。同時実行数を+1し、最大値を更新する。
 * @param {ReturnType<typeof createNorthStarMirrorPublishRaceState>|null|undefined} state
 */
export function beginNorthStarRefreshAll(state) {
  if (!state || typeof state !== 'object') return;
  state.inflight += 1;
  if (state.inflight > state.inflightMax) state.inflightMax = state.inflight;
}

/**
 * refreshAllNorthStarMirrorLanes の終了時(finally相当)に呼ぶ。同時実行数を-1する。
 * @param {ReturnType<typeof createNorthStarMirrorPublishRaceState>|null|undefined} state
 */
export function endNorthStarRefreshAll(state) {
  if (!state || typeof state !== 'object') return;
  state.inflight = Math.max(0, state.inflight - 1);
}

/**
 * publishNorthStarMirror が実際にflushへ進んだ(deferWriteでない)呼び出しのたびに呼ぶ。
 * @param {ReturnType<typeof createNorthStarMirrorPublishRaceState>|null|undefined} state
 */
export function observeNorthStarPublishCall(state) {
  if (!state || typeof state !== 'object') return;
  state.publishCalls += 1;
}

/**
 * mergeNorthStarMirrorLanes 呼び出し側で、liveId変化により合流バッファがリセットされたときに呼ぶ。
 * @param {ReturnType<typeof createNorthStarMirrorPublishRaceState>|null|undefined} state
 * @param {{ prevLiveId?: unknown, nextLiveId?: unknown }} obs
 */
export function observeNorthStarLiveIdReset(state, obs) {
  if (!state || typeof state !== 'object' || !obs || typeof obs !== 'object') return;
  const prev = String(obs.prevLiveId || '').trim();
  const next = String(obs.nextLiveId || '').trim();
  if (prev && next && prev !== next) state.liveIdReset += 1;
}

/**
 * _mirrorFlushScheduler.takeFlushPayload の結果を観測する。非nullなら実際にstorageへ書いた
 * (成功)、nullならmin-gap未経過等でスキップされた。
 * @param {ReturnType<typeof createNorthStarMirrorPublishRaceState>|null|undefined} state
 * @param {boolean} succeeded
 */
export function observeNorthStarFlushOutcome(state, succeeded) {
  if (!state || typeof state !== 'object') return;
  if (succeeded) state.flushSuccess += 1;
  else state.flushSkipped += 1;
}

/**
 * 状態速報1行を作る。publishCalls=0(未観測)は⚪(誤報しない)。
 * @param {ReturnType<typeof createNorthStarMirrorPublishRaceState>|null|undefined} state
 * @param {number} [singleFlightJoinCount] - v0.1.1184: single-flight化で合流し
 *   _refreshAllNorthStarMirrorLanesImpl自体の実行を省けた累計(joinが効いているかの直接証拠)。
 * @returns {{ line: string, inflightMax: number, publishCalls: number, liveIdReset: number,
 *   flushSuccess: number, flushSkipped: number, singleFlightJoinCount: number } | null}
 */
export function toNorthStarMirrorPublishRaceDiag(state, singleFlightJoinCount) {
  if (!state || typeof state !== 'object') return null;
  const joinCount = Number.isFinite(singleFlightJoinCount) ? singleFlightJoinCount : 0;
  let line;
  if (state.publishCalls <= 0) {
    line = '北極星鏡publish ⚪ 未観測';
  } else {
    const raceMark = state.inflightMax >= 2 ? '🔴' : '✅';
    // ★同時実行最大/publish累計/liveIdリセットは北極星専有カウンタ。flush成功/スキップは
    //   全9鏡共通のflushスケジューラの値(北極星専用ではない)なので「全鏡」と明記して誤読を防ぐ。
    //   ★v0.1.1184: single-flight合流累計を併記(joinが起きた回数=多重並行実行を防げた回数の直接証拠)。
    line =
      `北極星鏡publish ${raceMark} 同時実行最大${state.inflightMax} / publish累計${state.publishCalls}` +
      ` / liveIdリセット${state.liveIdReset} / 全鏡flush成功${state.flushSuccess}・スキップ${state.flushSkipped}` +
      ` / single-flight合流${joinCount}`;
  }
  return {
    line,
    inflightMax: state.inflightMax,
    publishCalls: state.publishCalls,
    liveIdReset: state.liveIdReset,
    flushSuccess: state.flushSuccess,
    flushSkipped: state.flushSkipped,
    singleFlightJoinCount: joinCount
  };
}

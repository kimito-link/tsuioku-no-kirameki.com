/**
 * 会場モードの「開いてから見えるまで」を分解して観測する純関数(v0.1.1207)。
 *
 * ユーザー報告(2026-08-01)「会場モードの立ち上がりが遅い、もしくは出ないときがある」。
 * 会場を開くと setOpen が2つの非同期処理を始める:
 *   (a) 鏡の catch-up: chrome.storage.local.get([KEY_LANE_MIRROR, ...]) を最大3秒待つ
 *   (b) 参加者集計: aggregateParticipants()(チャンク差分読み)
 * どちらも storage 待ちで、この間は席が埋まらない。だが今は「どちらがどれだけ待たせたか」を
 * 誰も測っていないため、遅い/出ないの切り分けができない(体感報告しか手がかりが無い)。
 *
 * ★このモジュールは数えるだけ。会場の描画・供給・タイミングには一切干渉しない。
 *   [[fastdiag-lite-is-the-printer-subset]]の教訓に従い、状態速報の本文まで通して初めて計器。
 *
 * @module venueOpenLatency
 */

/**
 * @typedef {{
 *   openedAt: number,
 *   mirrorReadyAt: number,
 *   aggregateReadyAt: number,
 *   firstPaintAt: number,
 *   firstSeatAt: number,
 *   mirrorTimedOut: boolean,
 *   mirrorAbsent: boolean,
 *   opens: number
 * }} VenueOpenLatencyState
 */

/** @returns {VenueOpenLatencyState} */
export function createVenueOpenLatencyState() {
  return {
    openedAt: 0,
    mirrorReadyAt: 0,
    aggregateReadyAt: 0,
    firstPaintAt: 0,
    firstSeatAt: 0,
    mirrorTimedOut: false,
    mirrorAbsent: false,
    opens: 0
  };
}

/**
 * 会場を開いた瞬間。以後の計測はここを起点にする(閉じて開き直すたびにリセット)。
 * @param {VenueOpenLatencyState|null|undefined} state
 * @param {number} nowMs
 */
export function noteVenueOpened(state, nowMs) {
  if (!state || typeof state !== 'object') return;
  const now = Number(nowMs) || 0;
  state.openedAt = now;
  state.mirrorReadyAt = 0;
  state.aggregateReadyAt = 0;
  state.firstPaintAt = 0;
  state.firstSeatAt = 0;
  state.mirrorTimedOut = false;
  state.mirrorAbsent = false;
  state.opens += 1;
}

/**
 * 鏡の catch-up が決着した瞬間(取れた/空だった/タイムアウトした のいずれも「決着」)。
 * @param {VenueOpenLatencyState|null|undefined} state
 * @param {number} nowMs
 * @param {{ timedOut?: boolean, absent?: boolean }} [outcome]
 */
export function noteVenueMirrorSettled(state, nowMs, outcome) {
  if (!state || typeof state !== 'object') return;
  if (!(state.openedAt > 0)) return; // 開く前の記録は捨てる
  if (state.mirrorReadyAt > 0) return; // 最初の1回だけ
  state.mirrorReadyAt = Number(nowMs) || 0;
  state.mirrorTimedOut = outcome?.timedOut === true;
  state.mirrorAbsent = outcome?.absent === true;
}

/**
 * 参加者集計(チャンク差分読み)が終わった瞬間。
 * @param {VenueOpenLatencyState|null|undefined} state
 * @param {number} nowMs
 */
export function noteVenueAggregateSettled(state, nowMs) {
  if (!state || typeof state !== 'object') return;
  if (!(state.openedAt > 0)) return;
  if (state.aggregateReadyAt > 0) return;
  state.aggregateReadyAt = Number(nowMs) || 0;
}

/**
 * 席の描画が走った瞬間。seatCount>0 なら「実際に人が見えた」時刻も別に控える。
 * ★「描いたが0人だった」と「人が見えた」を分けるのが要点。前者だけだと
 *   「出ない」という報告が仕様(匿名主体で0人)なのか不具合なのか区別できない。
 * @param {VenueOpenLatencyState|null|undefined} state
 * @param {number} nowMs
 * @param {number} seatCount
 */
export function noteVenueFirstPaint(state, nowMs, seatCount) {
  if (!state || typeof state !== 'object') return;
  if (!(state.openedAt > 0)) return;
  const now = Number(nowMs) || 0;
  if (state.firstPaintAt <= 0) state.firstPaintAt = now;
  const seats = Math.max(0, Math.floor(Number(seatCount) || 0));
  if (seats > 0 && state.firstSeatAt <= 0) state.firstSeatAt = now;
}

/** @param {number} from @param {number} to */
function elapsed(from, to) {
  if (!(from > 0) || !(to > 0) || to < from) return -1;
  return to - from;
}

/**
 * 状態速報に出す要約。取れていない区間は -1(不明)にして、嘘の0を作らない。
 * @param {VenueOpenLatencyState|null|undefined} state
 * @returns {{ opens: number, mirrorMs: number, aggregateMs: number, firstPaintMs: number, firstSeatMs: number, mirrorTimedOut: boolean, mirrorAbsent: boolean, line: string }}
 */
export function summarizeVenueOpenLatency(state) {
  const s = state && typeof state === 'object' ? state : createVenueOpenLatencyState();
  const mirrorMs = elapsed(s.openedAt, s.mirrorReadyAt);
  const aggregateMs = elapsed(s.openedAt, s.aggregateReadyAt);
  const firstPaintMs = elapsed(s.openedAt, s.firstPaintAt);
  const firstSeatMs = elapsed(s.openedAt, s.firstSeatAt);
  const opens = Math.max(0, Math.floor(Number(s.opens) || 0));

  if (opens <= 0) {
    return {
      opens: 0,
      mirrorMs: -1,
      aggregateMs: -1,
      firstPaintMs: -1,
      firstSeatMs: -1,
      mirrorTimedOut: false,
      mirrorAbsent: false,
      line: '会場立ち上がり ⚪ 未観測(会場をまだ開いていません)'
    };
  }

  /** @param {number} v @returns {string} */
  const ms = (v) => (v >= 0 ? `${v}ms` : '—');
  const flags = [];
  if (s.mirrorTimedOut) flags.push('鏡タイムアウト');
  if (s.mirrorAbsent) flags.push('鏡なし');
  // 席が出ないまま終わっているかどうかは、読み手が一番知りたい情報なので明示する。
  const seatNote =
    firstSeatMs >= 0
      ? `初席${ms(firstSeatMs)}`
      : firstPaintMs >= 0
        ? '初席—(描画はしたが0人=匿名主体なら仕様)'
        : '初席—(未描画)';

  return {
    opens,
    mirrorMs,
    aggregateMs,
    firstPaintMs,
    firstSeatMs,
    mirrorTimedOut: s.mirrorTimedOut === true,
    mirrorAbsent: s.mirrorAbsent === true,
    line:
      `会場立ち上がり 開いた${opens}回 / 鏡${ms(mirrorMs)} / 集計${ms(aggregateMs)}` +
      ` / 初描画${ms(firstPaintMs)} / ${seatNote}` +
      (flags.length ? ` / ${flags.join('・')}` : '')
  };
}

/**
 * venueMirrorIntakeDiag — 会場が鏡を「受け取れているか」を経路ごとに数える純関数(v0.1.1317)。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ★なぜ要るか（2026-08-10・会場モードが完全一致しない件の切り分け）
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 実機の状態速報:
 *     会場一致 ⚪鏡stale(656s) link7 gift0 ad4 konta0 tanu332
 *     応援レーン鏡publish: 最終0〜1秒前 / 見送り(els無し0 / 供給空0)
 *
 * ＝**書き手(publish)は毎秒動いていて見送り0**なのに、会場が見ている鏡は11分古い。
 * `lanePublishSkipDiag.js` の判断表どおり「**読み手が真因**」と確定している。
 *
 * ■ しかし既存の計器は「鏡が何秒古いか」しか言わない
 *   なぜ更新が止まったのかを名指しできない。候補は構造上こうなる:
 *     (a) onChanged が【そもそも来ていない】     → 書き手のキー or storage 経路
 *     (b) 来ているが【キーが一致せず無視】       → liveId 不一致(会場は location.pathname 由来、
 *                                                  書き手は popup が解決した liveId)
 *     (c) 採用しようとしたが【関所で捨てられた】 → sanitizeLaneMirrorForRead が null を返す
 *   ★(a)(b)(c) で打ち手が【正反対】なので、推測で直すと必ず外す
 *   （黒画面で実際に5回外した = [[measure-the-region-you-claim-2026-08-10]]）。
 *
 * ■ だからここは「症状(古い)」でなく【原因のありか】を出す
 *   ([[instrument-must-name-the-cause-2026-08-01]])
 *
 * @module venueMirrorIntakeDiag
 */

/** @typedef {{
 *   changedEvents: number,
 *   keyMatched: number,
 *   keyMissed: number,
 *   accepted: number,
 *   rejectedByGate: number,
 *   lastMissedKeys: string[],
 *   lastExpectedKey: string,
 *   lastAcceptedAt: number,
 *   lastRejectReason: string
 * }} VenueMirrorIntakeState */

/** @returns {VenueMirrorIntakeState} */
export function createVenueMirrorIntakeState() {
  return {
    changedEvents: 0,
    keyMatched: 0,
    keyMissed: 0,
    accepted: 0,
    rejectedByGate: 0,
    lastMissedKeys: [],
    lastExpectedKey: '',
    lastAcceptedAt: 0,
    lastRejectReason: ''
  };
}

/**
 * storage.onChanged が届いたときに1回呼ぶ(鏡キーが含まれていたかを問わず)。
 *
 * ★「鏡キーが含まれない onChanged」も数える。これがゼロなら
 *   そもそも購読が生きていない(=(a))と分かるため。
 *
 * @param {VenueMirrorIntakeState} state
 * @param {{ changedKeys: string[], expectedKey: string, matched: boolean }} obs
 */
export function observeVenueMirrorChange(state, obs) {
  if (!state || typeof state !== 'object') return;
  state.changedEvents += 1;
  state.lastExpectedKey = String(obs?.expectedKey || '');
  if (obs?.matched) {
    state.keyMatched += 1;
    return;
  }
  // ★鏡っぽいキー(nls_lane_mirror*)が来たのに期待キーと違う=liveId不一致の可能性。
  //   無関係なキーの変更まで keyMissed に数えると意味が薄れるので絞る。
  const mirrorish = (Array.isArray(obs?.changedKeys) ? obs.changedKeys : []).filter((k) =>
    String(k || '').startsWith('nls_lane_mirror')
  );
  if (mirrorish.length > 0) {
    state.keyMissed += 1;
    state.lastMissedKeys = mirrorish.slice(0, 3);
  }
}

/**
 * 関所(sanitizeLaneMirrorForRead)の結果を記録する。
 * @param {VenueMirrorIntakeState} state
 * @param {{ accepted: boolean, nowMs?: number, reason?: string }} obs
 */
export function observeVenueMirrorAccept(state, obs) {
  if (!state || typeof state !== 'object') return;
  if (obs?.accepted) {
    state.accepted += 1;
    const n = Number(obs?.nowMs);
    if (Number.isFinite(n) && n > 0) state.lastAcceptedAt = n;
    return;
  }
  state.rejectedByGate += 1;
  state.lastRejectReason = String(obs?.reason || '不明');
}

/**
 * @typedef {{
 *   cause: 'none'|'no-notify'|'key-mismatch'|'gate-reject'|'unobserved',
 *   level: 'ok'|'warn'|'bad'|'na',
 *   detail: string,
 *   nextAction: string,
 *   agoSec: number|null
 * }} VenueMirrorIntakeVerdict
 */

/**
 * ★v0.1.1405: (a)(b)(c) の判定を【文字列から独立させる】。
 *
 * ■ なぜ切り出すか
 *   この判定は v0.1.1317 から存在したが **整形済みの1行の中に閉じていた**。
 *   会場が publish するのも文字列(`mirrorIntakeLine`)だけなので、
 *   状態速報の本文を人が読む以外に使い道が無く、**セルにできなかった**
 *   ＝ 未解決の「鏡stale固定」を画面が名指しできない状態が続いていた。
 *
 * ★判定を1箇所に持ち、行もセルもここを呼ぶ。
 *   別々に書くと同じ観測に対して違うことを言う
 *   ([[shared-knowledge-is-not-shared-judgment-2026-08-10]])。
 *
 * @param {VenueMirrorIntakeState|null|undefined} state
 * @param {number} nowMs
 * @returns {VenueMirrorIntakeVerdict}
 */
export function judgeVenueMirrorIntake(state, nowMs) {
  const na = /** @type {VenueMirrorIntakeVerdict} */ ({
    cause: 'unobserved', level: 'na', detail: '', nextAction: '', agoSec: null
  });
  if (!state || typeof state !== 'object') return na;

  const ev = Number(state.changedEvents) || 0;
  const matched = Number(state.keyMatched) || 0;
  const missed = Number(state.keyMissed) || 0;
  const acc = Number(state.accepted) || 0;
  const rej = Number(state.rejectedByGate) || 0;
  if (ev === 0 && acc === 0 && rej === 0) return na;

  const now = Number(nowMs) || 0;
  const lastAcc = Number(state.lastAcceptedAt) || 0;
  const agoSec = lastAcc > 0 && now > lastAcc ? Math.round((now - lastAcc) / 1000) : null;

  // (b) 届いているがキーが違う = 別配信の鏡を見ている。
  if (matched === 0 && missed > 0) {
    const got = (state.lastMissedKeys || []).join(',') || '?';
    return {
      cause: 'key-mismatch', level: 'bad', agoSec,
      detail: `別の配信の鏡を見ています(期待「${state.lastExpectedKey || '?'}」/ 実際「${got}」)`,
      nextAction: '会場タブを開き直してください(配信IDの取り直し)'
    };
  }
  // (a) そもそも通知が来ていない = 購読が効いていない。
  if (matched === 0 && missed === 0) {
    return {
      cause: 'no-notify', level: 'bad', agoSec,
      detail: '鏡の変更通知が会場に一度も届いていません(購読が効いていない疑い)',
      nextAction: '会場タブを再読込してください'
    };
  }
  // (c) 届いているが関所で全部捨てている。
  if (rej > 0 && acc === 0) {
    return {
      cause: 'gate-reject', level: 'bad', agoSec,
      detail: `届いていますが全て捨てられています(${state.lastRejectReason || '不明'})`,
      nextAction: '①ポップアップを開き直して鏡を作り直してください'
    };
  }
  /*
   * ★受け取れている。ただし一部却下は正常(掟3: 一部見送りは正常)。
   *   全部却下のときだけ上で bad にしている。
   */
  return {
    cause: 'none', level: 'ok', agoSec,
    detail: agoSec != null ? `受け取れています(最終${agoSec}秒前)` : '受け取れています',
    nextAction: ''
  };
}

/**
 * 状態速報の1行にする。★原因のありかを名指しする。
 * ★判定は judgeVenueMirrorIntake が正本(ここは文字列にするだけ)。
 * @param {VenueMirrorIntakeState|null|undefined} state
 * @param {number} nowMs
 * @returns {string} 観測が無ければ ''
 */
export function formatVenueMirrorIntakeLine(state, nowMs) {
  if (!state || typeof state !== 'object') return '';
  const ev = Number(state.changedEvents) || 0;
  const matched = Number(state.keyMatched) || 0;
  const missed = Number(state.keyMissed) || 0;
  const acc = Number(state.accepted) || 0;
  const rej = Number(state.rejectedByGate) || 0;
  if (ev === 0 && acc === 0 && rej === 0) return '';

  const v = judgeVenueMirrorIntake(state, nowMs);
  const agoSec = v.agoSec;

  /*
   * ★従来の文言を1文字も変えない(既存 test と速報の見た目を守る)。
   *   判定の分岐だけを judge に委譲した。
   */
  let cause = '';
  if (v.cause === 'key-mismatch') {
    const got = (state.lastMissedKeys || []).join(',') || '?';
    cause =
      ` ★原因=鏡は届いているがキーが一致しない(期待「${state.lastExpectedKey || '?'}」` +
      ` / 実際「${got}」)＝会場と①で liveId が食い違っています`;
  } else if (v.cause === 'no-notify') {
    cause = ' ★原因=鏡の変更通知が会場に一度も届いていません(購読が効いていない疑い)';
  } else if (v.cause === 'gate-reject') {
    cause = ` ★原因=届いているが関所で全部捨てられています(${state.lastRejectReason})`;
  }

  return (
    `会場の鏡うけとり: 通知${ev}回 / キー一致${matched}・不一致${missed} / ` +
    `採用${acc}・関所却下${rej}` +
    (agoSec != null ? ` / 最終採用${agoSec}秒前` : ' / まだ一度も採用していません') +
    cause
  );
}

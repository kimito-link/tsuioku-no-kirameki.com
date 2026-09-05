/**
 * lanePublishSkipDiag — 応援レーン鏡の publish が「到達したか/何で見送られたか」を1行にする純関数。
 *
 * 【なぜ要るか】
 *   会場モード/③WEB が古い鏡を見る症状(実測 `鏡stale(656s)`・過去 21,437s=約6時間)の
 *   真因が未確定なまま、書き手を content へ移す大改修が検討されていた。
 *   しかし v0.1.1281 で publish は既に【描画より前・無条件】へ移されており、
 *   いま publish に到達しない経路は renderStoryUserLane の入口2つだけ:
 *     (a) els が取れない  = ①のレーンDOMが無い
 *     (b) entries が空    = 供給(コメント)が空
 *
 *   ★どちらが起きているかで打ち手が【正反対】になる:
 *     (a) → content(常駐)へ書き手を移すのが有効
 *     (b) → 供給側を直すべきで、書き手を移しても直らない
 *     どちらも0で鏡が古い → 鏡は止まっていない = 会場側の読み取りが真因
 *
 *   だから「まず測る」。推測で直して外した実績が同日に3回ある
 *   ([[settled-state-hides-flash-bugs-2026-08-07]] /
 *    [[red-may-be-snapshot-too-early-2026-08-08]])。
 *
 * 【担わない責務】
 *   カウントそのもの(popup-entry.js の _lanePublishSkipDiag が持つ)。
 *   ここは表示文字列を作るだけ=テスト容易・popup に行数を足さない。
 *
 * @module lanePublishSkipDiag
 */

/** 会場が鏡を「新鮮」とみなす窓(venueLaneParity.js の SOFT と同値)。超えたら注意を促す。 */
export const LANE_PUBLISH_SOFT_WINDOW_SEC = 180;

/**
 * @typedef {{
 *   noEls?: unknown,
 *   entriesEmpty?: unknown,
 *   lastPublishAt?: unknown,
 *   lastSkipAt?: unknown,
 *   lastSkipReason?: unknown
 * }} LanePublishSkipDiagState
 */

/** @param {unknown} v @returns {number} 非負整数(不正なら0) */
function nonNegInt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * 応援レーン鏡の publish 状況を1行にする。
 *
 * @param {LanePublishSkipDiagState|null|undefined} state popup の _lanePublishSkipDiag
 * @param {number} nowMs 壁時計
 * @returns {string} 状態速報に出す1行(state が無ければ空文字)
 */
export function formatLanePublishSkipLine(state, nowMs) {
  if (!state || typeof state !== 'object') return '';
  const now = Number(nowMs) || 0;
  const noEls = nonNegInt(state.noEls);
  const entriesEmpty = nonNegInt(state.entriesEmpty);
  const lastPublishAt = nonNegInt(state.lastPublishAt);

  const agoSec = lastPublishAt > 0 ? Math.max(0, Math.round((now - lastPublishAt) / 1000)) : -1;
  const agoLabel = agoSec < 0 ? '一度も無し' : `${agoSec}秒前`;
  const stale = agoSec >= 0 && agoSec > LANE_PUBLISH_SOFT_WINDOW_SEC;

  const parts = [`応援レーン鏡publish: 最終${agoLabel}${stale ? ' ⚠古い' : ''}`];
  parts.push(`見送り(els無し${noEls} / 供給空${entriesEmpty})`);

  // ★真因の名指し。件数を出すだけでなく「次にどこを直すか」まで言う
  //   ([[instrument-must-name-the-cause-2026-08-01]])。
  if (noEls > 0 && entriesEmpty === 0) {
    parts.push('→ ①のレーンDOMが無い状態がある=常駐側(content)へ書き手を移すのが有効');
  } else if (entriesEmpty > 0 && noEls === 0) {
    parts.push('→ 供給(コメント)が空=書き手を移しても直らない。供給側を見る');
  } else if (noEls > 0 && entriesEmpty > 0) {
    parts.push('→ 両方あり=多い方から手を付ける');
  } else if (stale) {
    parts.push('→ 見送り0なのに鏡が古い=publishは動いている。会場側の読み取りを疑う');
  }

  return parts.join(' / ');
}

/**
 * popup 診断 JSON へ載せる形にまとめる(popup 側に行数を足さないため lib に置く)。
 *
 * @param {LanePublishSkipDiagState|null|undefined} state
 * @param {number} nowMs
 * @returns {{
 *   noEls: number, entriesEmpty: number, lastSkipReason: string,
 *   lastPublishAgoSec: number, lastSkipAgoSec: number, line: string
 * }|null}
 */
export function snapshotLanePublishSkipDiag(state, nowMs) {
  if (!state || typeof state !== 'object') return null;
  const now = Number(nowMs) || 0;
  /** @param {unknown} at */
  const agoSecOf = (at) => {
    const t = nonNegInt(at);
    return t > 0 ? Math.max(0, Math.round((now - t) / 1000)) : -1;
  };
  return {
    noEls: nonNegInt(state.noEls),
    entriesEmpty: nonNegInt(state.entriesEmpty),
    lastSkipReason: String(state.lastSkipReason || ''),
    lastPublishAgoSec: agoSecOf(state.lastPublishAt),
    lastSkipAgoSec: agoSecOf(state.lastSkipAt),
    line: formatLanePublishSkipLine(state, now)
  };
}

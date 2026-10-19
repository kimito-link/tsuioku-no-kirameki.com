/**
 * サイドパネルが「隠れてから再表示された」回ごとの、次の描画までの時間の記録(純粋関数)。v0.1.1695
 *
 * ■ なぜ要るか(2026-10-19・タブ切り替えで縞が出る件)
 *   パネルの文書はタブ切り替えでは作り直されない(実験で確定)。縞は、隠れていたパネルが再表示されてから
 *   次の最初のフレームが出るまでの間。その長さ(=再表示の瞬間から次の描画の合図までの遅れ)と、直後1秒に走った
 *   長い処理を、回ごとに残し、状態速報で読めるようにする(ユーザーが言わなくても分かる)。
 *   既存の「黒い幕の記録」は文書の作成を測るので、再表示は測れていなかった。
 * 事実の数字だけ・原因は断定しない・描画に関与しない。
 * @module showToFrameLedger
 */

export const SHOW_EVENTS_CAP = 12;

/** @typedef {{ at: number, hiddenMs: number|null, toFrameMs: number, longN: number, longMs: number, longMax: number }} ShowEvent */

/** @param {unknown} v */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * @param {ShowEvent[]} list
 * @param {ShowEvent} ev
 * @returns {ShowEvent[]} 新しい配列(古い順・上限 SHOW_EVENTS_CAP)
 */
export function addShowEvent(list, ev) {
  const base = Array.isArray(list) ? list.slice() : [];
  if (ev && typeof ev === 'object' && num(ev.at) != null && num(ev.toFrameMs) != null) base.push(ev);
  return base.slice(-SHOW_EVENTS_CAP);
}

/** @param {number[]} xs */
function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * @param {ShowEvent[]|null|undefined} events
 * @param {number} nowMs
 * @returns {string} 記録が無ければ ''
 */
export function formatShowToFrameLine(events, nowMs) {
  const list = Array.isArray(events) ? events.filter((e) => e && num(e.toFrameMs) != null) : [];
  if (!list.length) return '';
  const toFrame = list.map((e) => /** @type {number} */ (num(e.toFrameMs)));
  const longMax = Math.max(...list.map((e) => num(e.longMax) ?? 0));
  const last = list[list.length - 1];
  const agoS = Math.max(0, Math.round((nowMs - /** @type {number} */ (num(last.at))) / 1000));
  const hid = num(last.hiddenMs);
  return (
    `再表示の記録(隠れていたパネルが戻った回): 直近${list.length}回 / 次の描画まで 中央値${median(toFrame)}ms(最大${Math.max(...toFrame)}ms)` +
    ` / 直後1秒の長い処理 最大${longMax}ms` +
    ` / 直近 ${agoS}秒前${hid != null ? `・${Math.round(hid / 1000)}秒隠れて` : ''}・次の描画まで${last.toFrameMs}ms・長い処理${num(last.longN) ?? 0}回/計${num(last.longMs) ?? 0}ms`
  );
}

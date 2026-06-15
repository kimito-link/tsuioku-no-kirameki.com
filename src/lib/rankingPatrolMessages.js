/**
 * ランキング巡回(「次の上位配信へ」/ 自動巡回トグル)の共有定数と純関数。
 *
 * 既存の autopatrol(background.js)が持つ「未訪問の lv を queue から1つ選ぶ」
 * ロジックを純関数として切り出し、background と status(UI)で共用する。
 *
 * @module rankingPatrolMessages
 */

/** 「次の上位配信へ」要求のメッセージ type。 */
export const NEXT_LIVE_REQUEST_TYPE = 'NLS_NEXT_LIVE_REQUEST';

/** 自動巡回トグルの storage キー(background.js の KEY_AUTOPATROL_ENABLED と一致)。 */
export const AUTOPATROL_ENABLED_KEY = 'nls_autopatrol_enabled_v1';

/** lv 形式の検証。 */
const LV_RE = /^lv\d{5,12}$/;

/**
 * queue / visited / 候補から「次に開くべき lv」を1つ選ぶ(純関数)。
 *
 * 優先順:
 *   1) queue の先頭から、visited にも除外 lv にも無い最初の lv
 *   2) 無ければ candidates(新規発見分)から、visited・queue・除外に無い最初の lv
 *
 * @param {{
 *   queue?: string[],
 *   visited?: string[],
 *   candidates?: string[],
 *   excludeLv?: string|null
 * }} opts
 * @returns {{ lv: string|null, nextQueue: string[], nextVisited: string[] }}
 */
export function pickNextPatrolLv(opts = {}) {
  const norm = (/** @type {unknown} */ v) => String(v || '').trim().toLowerCase();
  const exclude = norm(opts.excludeLv);
  const queue = (Array.isArray(opts.queue) ? opts.queue : [])
    .map(norm)
    .filter((/** @type {string} */ v) => LV_RE.test(v));
  const visited = (Array.isArray(opts.visited) ? opts.visited : []).map(norm).filter((v) => LV_RE.test(v));
  const candidates = (Array.isArray(opts.candidates) ? opts.candidates : [])
    .map(norm)
    .filter((v) => LV_RE.test(v));

  const visitedSet = new Set(visited);
  if (exclude) visitedSet.add(exclude);

  // 1) queue から未訪問の先頭を探す。
  let chosen = null;
  const remainingQueue = [];
  for (const lv of queue) {
    if (chosen == null && !visitedSet.has(lv)) {
      chosen = lv;
      continue; // 選んだものは queue から外す
    }
    remainingQueue.push(lv);
  }

  // 2) queue で見つからなければ candidates から補充して選ぶ。
  if (chosen == null) {
    const inQueue = new Set(remainingQueue);
    for (const lv of candidates) {
      if (visitedSet.has(lv) || inQueue.has(lv)) continue;
      if (chosen == null) {
        chosen = lv;
      } else {
        remainingQueue.push(lv);
        inQueue.add(lv);
      }
    }
  }

  const nextVisited = chosen ? [...visited, chosen] : visited.slice();
  return { lv: chosen, nextQueue: remainingQueue, nextVisited };
}

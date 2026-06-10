import { comeviewUserKeyForRow } from './comeviewActions.js';

/** @param {unknown} value @param {number} max */
function clippedText(value, max) {
  return String(value == null ? '' : value)
    .trim()
    .slice(0, max);
}

/**
 * 行単位で隠すためのセッション内シグネチャ。
 * @param {import('./supportActivityTimeline.js').TimelineItem|null|undefined} item
 * @returns {string}
 */
export function comeviewTimelineItemSignature(item) {
  if (!item || typeof item !== 'object') return '';
  const uid = clippedText(item.userId, 40);
  if (item.kind === 'gift') {
    return `g|${uid}|${clippedText(item.itemName, 120)}`;
  }
  return `c|${uid}|${clippedText(item.text, 500)}`;
}

/**
 * NG と「この行を隠す」をタイムラインへ適用する。
 * @param {readonly import('./supportActivityTimeline.js').TimelineItem[]|unknown} timeline
 * @param {Set<string>} ngKeys
 * @param {Set<string>} hiddenSigs
 * @returns {import('./supportActivityTimeline.js').TimelineItem[]}
 */
export function filterVisibleComeviewTimeline(timeline, ngKeys, hiddenSigs) {
  if (!Array.isArray(timeline)) return [];
  const ng = ngKeys instanceof Set ? ngKeys : new Set();
  const hidden = hiddenSigs instanceof Set ? hiddenSigs : new Set();
  return timeline.filter((item) => {
    if (!item || typeof item !== 'object') return false;
    const sig = comeviewTimelineItemSignature(item);
    if (sig && hidden.has(sig)) return false;
    const userKey = comeviewUserKeyForRow({
      userId: item.userId,
      name: item.nickname
    });
    return !userKey || !ng.has(userKey);
  });
}

/**
 * 時系列昇順の末尾から最新 max 件を返す。
 * @param {readonly import('./supportActivityTimeline.js').TimelineItem[]|unknown} timeline
 * @param {number} max
 * @returns {import('./supportActivityTimeline.js').TimelineItem[]}
 */
export function keepLatestComeviewTimelineItems(timeline, max) {
  if (!Array.isArray(timeline)) return [];
  const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : 1;
  return timeline.length > cap ? timeline.slice(timeline.length - cap) : [...timeline];
}

/**
 * TimelineItem.key で未描画行だけを昇順のまま返す。
 * @param {readonly import('./supportActivityTimeline.js').TimelineItem[]|unknown} timeline
 * @param {Set<string>} renderedKeys
 * @returns {import('./supportActivityTimeline.js').TimelineItem[]}
 */
export function pickNewComeviewTimelineItems(timeline, renderedKeys) {
  if (!Array.isArray(timeline)) return [];
  const seen = new Set(renderedKeys instanceof Set ? renderedKeys : []);
  const fresh = [];
  for (const item of timeline) {
    const key = clippedText(item?.key, 500);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    fresh.push(item);
  }
  return fresh;
}

/**
 * storage の配列全置換から、前回には無かった追加分だけを多重集合として抽出する。
 * FIFO で古い要素が落ちても、残存要素を新着として誤判定しない。
 *
 * @param {readonly Record<string, unknown>[]|unknown} previous
 * @param {readonly Record<string, unknown>[]|unknown} next
 * @param {'comment'|'gift'} kind
 * @returns {Record<string, unknown>[]}
 */
export function pickAppendedComeviewSnapshotRows(previous, next, kind) {
  const before = Array.isArray(previous) ? previous : [];
  const after = Array.isArray(next) ? next : [];
  const counts = new Map();
  for (const row of before) {
    const id = comeviewSnapshotRowIdentity(row, kind);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const added = [];
  for (const row of after) {
    const id = comeviewSnapshotRowIdentity(row, kind);
    const remaining = counts.get(id) || 0;
    if (remaining > 0) {
      counts.set(id, remaining - 1);
    } else {
      added.push(row);
    }
  }
  return added;
}

/**
 * 追加された storage 行に対応する TimelineItem だけを選ぶ。
 * TimelineItem 自体は現在の全テール/ギフト配列から生成するため、gift の key 連番も
 * 全置換リフレッシュ時と一致する。
 *
 * @param {readonly import('./supportActivityTimeline.js').TimelineItem[]|unknown} timeline
 * @param {readonly Record<string, unknown>[]|unknown} addedComments
 * @param {readonly Record<string, unknown>[]|unknown} addedGifts
 * @returns {import('./supportActivityTimeline.js').TimelineItem[]}
 */
export function selectAppendedComeviewTimelineItems(
  timeline,
  addedComments,
  addedGifts
) {
  if (!Array.isArray(timeline)) return [];
  const counts = new Map();
  /** @param {Record<string, unknown>} row @param {'comment'|'gift'} kind */
  const addCount = (row, kind) => {
    const id = comeviewSnapshotRowIdentity(row, kind);
    counts.set(id, (counts.get(id) || 0) + 1);
  };
  if (Array.isArray(addedComments)) {
    for (const row of addedComments) addCount(row, 'comment');
  }
  if (Array.isArray(addedGifts)) {
    for (const row of addedGifts) addCount(row, 'gift');
  }
  const selected = [];
  for (const item of timeline) {
    const id = comeviewSnapshotRowIdentity(item, item?.kind);
    const remaining = counts.get(id) || 0;
    if (remaining <= 0) continue;
    counts.set(id, remaining - 1);
    selected.push(item);
  }
  return selected;
}

/**
 * @param {Record<string, unknown>|import('./supportActivityTimeline.js').TimelineItem|null|undefined} row
 * @param {'comment'|'gift'|unknown} kind
 * @returns {string}
 */
function comeviewSnapshotRowIdentity(row, kind) {
  const source =
    row && typeof row === 'object'
      ? /** @type {Record<string, unknown>} */ (row)
      : {};
  const at = Number(source.capturedAt ?? source.at);
  const capturedAt = Number.isFinite(at) ? at : 0;
  const userId = clippedText(source.userId, 40);
  if (kind === 'gift') {
    const point = Number(source.point);
    return JSON.stringify([
      'g',
      userId,
      clippedText(source.itemName, 120),
      Number.isFinite(point) && point >= 0 ? Math.floor(point) : 0,
      clippedText(source.message, 300),
      capturedAt
    ]);
  }
  return JSON.stringify([
    'c',
    clippedText(source.commentNo, 40),
    userId,
    clippedText(source.text, 500),
    capturedAt
  ]);
}

/**
 * v0.1.679 二重表示根治: 行の安定識別子。
 * テール行と正本(IDB)行は同じコメントでも capturedAt / id がズレることがある
 * (再キャプチャ・IDB autoIncrement)ため、経路を跨いで安定なのは commentNo だけ。
 * @param {Record<string, unknown>|null|undefined} row 生行 or TimelineItem
 * @returns {string} commentNo(無ければ '')
 */
export function commentNoOfComeviewRow(row) {
  if (!row || typeof row !== 'object') return '';
  const source = /** @type {Record<string, unknown>} */ (row);
  return clippedText(source.commentNo ?? source.no, 40);
}

/**
 * commentNo が既出のコメント行を除く(無番号行は素通し=従来挙動)。
 * @param {readonly Record<string, unknown>[]|unknown} rows
 * @param {Set<string>} seenNos
 * @returns {Record<string, unknown>[]}
 */
export function filterUnseenComeviewComments(rows, seenNos) {
  if (!Array.isArray(rows)) return [];
  const seen = seenNos instanceof Set ? seenNos : new Set();
  return rows.filter((row) => {
    const no = commentNoOfComeviewRow(row);
    return !no || !seen.has(no);
  });
}

/**
 * ギフトの「再キャプチャ重複」を除く。同一内容(uid/アイテム/pt/メッセージ)のギフトが
 * windowMs 以内に再出現したら重複として捨てる(同じ人が本当に2回投げるのは通常分単位で離れる)。
 * seenAtBySig は呼び出し側が保持する Map(sig→最後に見た at)。本関数が更新する。
 * @param {readonly Record<string, unknown>[]|unknown} rows
 * @param {Map<string, number>} seenAtBySig
 * @param {number} [windowMs]
 * @returns {Record<string, unknown>[]}
 */
export function pickUnseenComeviewGifts(rows, seenAtBySig, windowMs = 90_000) {
  if (!Array.isArray(rows)) return [];
  const seen = seenAtBySig instanceof Map ? seenAtBySig : new Map();
  const win = Number.isFinite(windowMs) && windowMs >= 0 ? windowMs : 90_000;
  const fresh = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const source = /** @type {Record<string, unknown>} */ (row);
    const point = Number(source.point);
    const sig = JSON.stringify([
      clippedText(source.userId, 40),
      clippedText(source.itemName, 120),
      Number.isFinite(point) && point >= 0 ? Math.floor(point) : 0,
      clippedText(source.message, 300)
    ]);
    const atRaw = Number(source.capturedAt ?? source.at);
    const at = Number.isFinite(atRaw) ? atRaw : 0;
    const last = seen.get(sig);
    if (last != null && Math.abs(at - last) <= win) continue;
    seen.set(sig, at);
    fresh.push(row);
  }
  return fresh;
}

/**
 * @param {{scrollTop?:number,clientHeight?:number,scrollHeight?:number}|null|undefined} metrics
 * @param {number} [threshold]
 * @returns {boolean}
 */
export function isComeviewNearBottom(metrics, threshold = 80) {
  const scrollTop = Math.max(0, Number(metrics?.scrollTop) || 0);
  const clientHeight = Math.max(0, Number(metrics?.clientHeight) || 0);
  const scrollHeight = Math.max(0, Number(metrics?.scrollHeight) || 0);
  const limit =
    Number.isFinite(threshold) && threshold >= 0 ? Number(threshold) : 80;
  return Math.max(0, scrollHeight - clientHeight - scrollTop) <= limit;
}

// ytSwitchLeakCleanup.js — 配信を切り替えた瞬間に、前の配信のチャット欄に残っていたコメントが
// 新しい配信の記録に入ってしまった分(0.1.35 まで)を見分ける純関数。
//
// 見分け方(3つ全部に当てはまるものだけ):
//   1. 新しい配信の記録の「最初の数秒」に入った
//   2. その人(チャンネルID・無ければ名前)が、前の配信の記録にもいる
//   3. その人は、最初の数秒より後には新しい配信で一度もコメントしていない(=本当にこの配信にいた人は消さない)

/** @param {any} it */
function authorKey(it) {
  const ch = String(it?.channelId || '').trim();
  if (ch) return `ch:${ch}`;
  const name = String(it?.name || it?.authorName || '').trim();
  return name ? `name:${name}` : '';
}

/**
 * @param {any[]} targetItems 新しい配信の記録
 * @param {any[]} prevItems 前の配信の記録
 * @param {number} [windowMs]
 * @returns {string[]} 消す記録の pk
 */
export function pickSwitchLeakPks(targetItems, prevItems, windowMs = 3000) {
  const target = Array.isArray(targetItems) ? targetItems : [];
  const prev = Array.isArray(prevItems) ? prevItems : [];
  if (!target.length || !prev.length) return [];
  let first = Infinity;
  for (const it of target) {
    const t = Number(it?.recordedAt);
    if (Number.isFinite(t) && t < first) first = t;
  }
  if (!Number.isFinite(first)) return [];
  const edge = first + windowMs;
  const prevAuthors = new Set(prev.map(authorKey).filter(Boolean));
  /** @type {Set<string>} */
  const laterAuthors = new Set();
  for (const it of target) {
    if (Number(it?.recordedAt) > edge) {
      const k = authorKey(it);
      if (k) laterAuthors.add(k);
    }
  }
  /** @type {string[]} */
  const out = [];
  for (const it of target) {
    if (!(Number(it?.recordedAt) <= edge)) continue;
    const k = authorKey(it);
    if (!k || !prevAuthors.has(k) || laterAuthors.has(k)) continue;
    if (it?.pk) out.push(String(it.pk));
  }
  return out;
}

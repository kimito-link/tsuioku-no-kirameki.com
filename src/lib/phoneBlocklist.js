/**
 * スマホで「この人を隠す」(純関数)。iPhone アプリの審査(ほかの人の書き込みを見せるアプリは、
 *   見たくない人を隠せること・報告できることが要る)に合わせて、この端末だけで隠す人を覚える。
 *   隠すのは画面に出す前(コメントの流れと応援レーン)。PC の記録やサーバーには何も書かない。
 *
 * @module phoneBlocklist
 */

export const PHONE_BLOCKLIST_KEY = 'nls_phone_blocklist_v1';
/** 覚えておく人数の上限。 */
export const PHONE_BLOCKLIST_MAX = 200;
const LANE_TIERS = ['link', 'konta', 'tanu', 'gift', 'ad'];

/** @param {unknown} raw @returns {string[]} */
export function parseBlocklist(raw) {
  /** @type {unknown} */
  let v = raw;
  if (typeof raw === 'string') {
    try { v = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(v)) return [];
  /** @type {string[]} */
  const out = [];
  for (const x of v) {
    const id = String(x == null ? '' : x).trim();
    if (id && id.length <= 64 && !out.includes(id)) out.push(id);
  }
  return out.slice(-PHONE_BLOCKLIST_MAX);
}

/**
 * まとめから隠す人の行を抜く。隠す人がいなければ同じものを返す(余計に作り直さない)。
 * @param {any} jsonBlob
 * @param {string[]} blocked
 */
export function applyPhoneBlocklist(jsonBlob, blocked) {
  if (!jsonBlob || typeof jsonBlob !== 'object' || !Array.isArray(blocked) || blocked.length === 0) return jsonBlob;
  const set = new Set(blocked);
  const keep = (/** @type {any} */ r) => !(r && set.has(String(r.userId || r.entry?.userId || '')));
  const out = { ...jsonBlob };
  const ctm = jsonBlob.commentTimelineMirror;
  if (ctm && Array.isArray(ctm.rows)) out.commentTimelineMirror = { ...ctm, rows: ctm.rows.filter(keep) };
  const lane = jsonBlob.laneMirror;
  if (lane && typeof lane === 'object') {
    const next = { ...lane };
    for (const t of LANE_TIERS) if (Array.isArray(lane[t])) next[t] = lane[t].filter(keep);
    out.laneMirror = next;
  }
  return out;
}

/**
 * 「隠す」候補: 最近書いた人(新しい順・同じ人は1回)。
 * @param {any[]} rows コメント鏡の行(古→新)
 * @param {number} [max]
 * @returns {{ userId: string, name: string, text: string }[]}
 */
export function recentPeopleForBlock(rows, max = 15) {
  const out = [];
  const seen = new Set();
  const list = Array.isArray(rows) ? rows : [];
  for (let i = list.length - 1; i >= 0 && out.length < max; i -= 1) {
    const r = list[i];
    const userId = String(r?.userId || '').trim();
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    out.push({ userId, name: String(r?.name || '匿名'), text: String(r?.text || '').slice(0, 40) });
  }
  return out;
}

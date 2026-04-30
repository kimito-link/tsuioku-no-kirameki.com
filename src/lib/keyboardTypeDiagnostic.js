/**
 * L12: キーボード型診断（コメンターを 5 つの型に分類）。
 *
 * 設計（0.1.23 X / ラテラル思考 L12）:
 *   - quiet     … 1 件以下 = 観戦派
 *   - emoji     … 全文字数の 30% 以上が絵文字
 *   - short     … 平均字数 < 5
 *   - long      … 平均字数 >= 25
 *   - balanced  … それ以外
 */

/**
 * @typedef {'emoji' | 'short' | 'long' | 'quiet' | 'balanced'} KeyboardType
 */

/**
 * @typedef {{ userId?: any, text?: any }} KeyboardCommentInput
 */

const EMOJI_REGEX = /\p{Extended_Pictographic}/gu;

/**
 * @param {string} text
 * @returns {number} 含まれる絵文字数
 */
function countEmojis(text) {
  if (!text) return 0;
  const m = String(text).match(EMOJI_REGEX);
  return m ? m.length : 0;
}

/**
 * @param {{ count: number, totalChars: number, emojiCount: number }} stats
 * @returns {KeyboardType}
 */
export function classifyKeyboardType(stats) {
  const count = typeof stats?.count === 'number' ? stats.count : 0;
  const totalChars = typeof stats?.totalChars === 'number' ? stats.totalChars : 0;
  const emojiCount = typeof stats?.emojiCount === 'number' ? stats.emojiCount : 0;
  if (count <= 1) return 'quiet';
  if (totalChars > 0 && emojiCount / totalChars >= 0.3) return 'emoji';
  const avg = totalChars / count;
  if (avg < 5) return 'short';
  if (avg >= 25) return 'long';
  return 'balanced';
}

/**
 * @typedef {{
 *   userTypeMap: Record<string, KeyboardType>,
 *   counts: Record<KeyboardType, number>
 * }} KeyboardTypeReport
 */

/**
 * @param {KeyboardCommentInput[] | null | undefined} comments
 * @param {{ broadcasterUserId?: string } | undefined} [opts]
 * @returns {KeyboardTypeReport}
 */
export function diagnoseKeyboardTypes(comments, opts = {}) {
  const broadcasterUid =
    typeof opts?.broadcasterUserId === 'string' ? opts.broadcasterUserId.trim() : '';
  const list = Array.isArray(comments) ? comments : [];
  /** @type {Map<string, { count: number, totalChars: number, emojiCount: number }>} */
  const map = new Map();
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const uid = c.userId == null ? '' : String(c.userId).trim();
    if (!uid) continue;
    if (broadcasterUid && uid === broadcasterUid) continue;
    const text = c.text == null ? '' : String(c.text);
    const len = text.length;
    const emoji = countEmojis(text);
    let row = map.get(uid);
    if (!row) {
      row = { count: 0, totalChars: 0, emojiCount: 0 };
      map.set(uid, row);
    }
    row.count += 1;
    row.totalChars += len;
    row.emojiCount += emoji;
  }

  /** @type {Record<string, KeyboardType>} */
  const userTypeMap = {};
  /** @type {Record<KeyboardType, number>} */
  const counts = { emoji: 0, short: 0, long: 0, quiet: 0, balanced: 0 };
  for (const [uid, stats] of map) {
    const t = classifyKeyboardType(stats);
    userTypeMap[uid] = t;
    counts[t] += 1;
  }
  return { userTypeMap, counts };
}

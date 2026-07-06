/**
 * ニコ生の「来場」システムメッセージ文字列をパースする純粋関数。
 *
 * 2026-07-06: X で話題になった「来場通知」をパチンコの入賞演出(保留玉が入る)として
 * 検知するための土台。parseGiftComment.js と同じ流儀(厳格 regex・誤検知ゼロ優先)。
 *
 * 対応する4形式(すべて実例):
 *   1. 「放送者の好み「真夏の夜の淫夢」に興味のある1人が来場しました」
 *        → { entries: [{ keyword: '真夏の夜の淫夢', count: 1, source: 'preference' }], totalCount: 1 }
 *   2. 「大百科記事「真夏の夜の淫夢」から1人が来場しました」
 *        → { entries: [{ keyword: '真夏の夜の淫夢', count: 1, source: 'dictionary' }], totalCount: 1 }
 *   3. 「「ニコニコ生放送」が好きな2人、「真夏の夜の淫夢」が好きな1人が来場しました」
 *        → { entries: [
 *             { keyword: 'ニコニコ生放送', count: 2, source: 'like' },
 *             { keyword: '真夏の夜の淫夢', count: 1, source: 'like' }
 *           ], totalCount: 3 }
 *   4. 「大百科記事「おっぱい」から1人、「百合」から1人が来場しました」
 *        → { entries: [
 *             { keyword: 'おっぱい', count: 1, source: 'dictionary' },
 *             { keyword: '百合', count: 1, source: 'dictionary' }
 *           ], totalCount: 2 }
 *
 * 鉤括弧は「」『』の両方を許容(niconico 側の表記揺れ対策・parseGiftComment.js と同方針)。
 * マッチしなければ null(通常コメント・ギフトコメント等の誤検知を避ける)。
 */

/**
 * @typedef {{ keyword: string, count: number, source: 'dictionary'|'preference'|'like'|'interest' }} ArrivalEntry
 */

/**
 * @typedef {{ entries: ArrivalEntry[], totalCount: number }} ParsedArrivalComment
 */

// 鉤括弧内の中身(「」『』どちらでもよい・貪欲でない・空文字は不可)。
const BRACKET = '[「『]([^」』]+)[」』]';
// 「N人」のNを取る(全角数字は niconico の来場メッセージでは使われない=半角数字前提)。
const COUNT = '(\\d+)人';

/**
 * 末尾の「が来場しました」を厳格に要求する(誤検知ゼロ優先・parseGiftComment.js と同方針)。
 */
const TAIL = 'が来場しました$';

// 形式1: 「放送者の好み「XXX」に興味のあるN人が来場しました」
const RE_PREFERENCE = new RegExp(`^放送者の好み${BRACKET}に興味のある${COUNT}${TAIL}`);
// 形式2: 「大百科記事「XXX」からN人が来場しました」(単一) / 「…からN人、…からN人が来場しました」(複数)
//   複数形式4は先に全体を分割してから各要素をパースする(下記 parseDictionaryMultiple 参照)。
const RE_DICTIONARY_SINGLE = new RegExp(`^大百科記事${BRACKET}から${COUNT}${TAIL}`);
// 形式3: 「「XXX」が好きなN人が来場しました」(単一) / 「…が好きなN人、…が好きなN人が来場しました」(複数)
const RE_LIKE_SINGLE = new RegExp(`^${BRACKET}が好きな${COUNT}${TAIL}`);

/** @param {string} s @returns {string} */
function stripTail(s) {
  return s.replace(/が来場しました$/, '');
}

/**
 * カンマ区切りの複数要素を「各要素は末尾に接続詞相当が付かず、最後の要素だけ末尾が付く」形で
 * 分割してパースする共通ヘルパ。
 * 例: 「大百科記事「おっぱい」から1人、「百合」から1人」(TAIL 除去済み)
 *   → ['大百科記事「おっぱい」から1人', '「百合」から1人']
 * 2要素目以降は先頭の「大百科記事」/主語が省略される表記揺れがあるため、要素ごとの
 * regex は「(大百科記事)?BRACKET から COUNT人」のように先頭を任意にする。
 *
 * @param {string} bodyNoTail 「が来場しました」を除いた本文
 * @returns {string[]} 分割された要素文字列(トリム済み)。
 */
function splitCommaItems(bodyNoTail) {
  const parts = bodyNoTail.split('、').map((s) => s.trim()).filter(Boolean);
  return parts;
}

/**
 * @param {string} text
 * @returns {ParsedArrivalComment | null}
 */
export function parseArrivalCommentText(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!/が来場しました$/.test(trimmed)) return null; // 誤検知ゼロ優先: 末尾が違えば即棄却

  // 形式1: 放送者の好み(常に単一)。
  const mPref = trimmed.match(RE_PREFERENCE);
  if (mPref) {
    const keyword = mPref[1].trim();
    const count = parseInt(mPref[2], 10);
    if (keyword && Number.isFinite(count) && count > 0) {
      return { entries: [{ keyword, count, source: 'interest' }], totalCount: count };
    }
    return null;
  }

  const bodyNoTail = stripTail(trimmed);

  // 形式2: 大百科記事(単一 or カンマ区切り複数)。
  if (/^大百科記事/.test(bodyNoTail)) {
    const items = splitCommaItems(bodyNoTail);
    /** @type {ArrivalEntry[]} */
    const entries = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      // 1つめは「大百科記事「XXX」からN人」、2つめ以降は「大百科記事」省略で「「XXX」からN人」。
      const re = i === 0 ? /^大百科記事[「『]([^」』]+)[」』]から(\d+)人$/ : /^[「『]([^」』]+)[」』]から(\d+)人$/;
      const m = item.match(re);
      if (!m) return null; // 1要素でも形が崩れていれば誤検知回避で全体を棄却
      const keyword = m[1].trim();
      const count = parseInt(m[2], 10);
      if (!keyword || !Number.isFinite(count) || count <= 0) return null;
      entries.push({ keyword, count, source: 'dictionary' });
    }
    if (entries.length === 0) return null;
    return { entries, totalCount: entries.reduce((s, e) => s + e.count, 0) };
  }

  // 形式3: 「XXX」が好きな(単一 or カンマ区切り複数)。
  if (/^[「『]/.test(bodyNoTail)) {
    const items = splitCommaItems(bodyNoTail);
    /** @type {ArrivalEntry[]} */
    const entries = [];
    for (const item of items) {
      const m = item.match(/^[「『]([^」』]+)[」』]が好きな(\d+)人$/);
      if (!m) return null;
      const keyword = m[1].trim();
      const count = parseInt(m[2], 10);
      if (!keyword || !Number.isFinite(count) || count <= 0) return null;
      entries.push({ keyword, count, source: 'like' });
    }
    if (entries.length === 0) return null;
    return { entries, totalCount: entries.reduce((s, e) => s + e.count, 0) };
  }

  return null;
}

/** 参考: 単一形式のみを直接試したい呼び出し元向けの named export(現状未使用・テスト用途)。 */
export const _internal = { RE_PREFERENCE, RE_DICTIONARY_SINGLE, RE_LIKE_SINGLE };

/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】YouTube の「N 件の返信」の文言から返信の数を読む・たたまれた(未読み込みの)返信の数を数える
 * 【この箱に入らないもの】DOM の読み取り・fetch / storage / chrome.* / Observer / タイマー
 * 【書けるstorageキー】なし
 * 【正本宣言】返信の数の読み方はこのファイル
 */

/** @param {string} text */
function normalizeLabel(text) {
  return text
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/，/g, ',')
    .replace(/．/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 「6 件の返信」「View 6 replies」「1.2K replies」「1万 件の返信」などから返信の数を読む。読めなければ null。
 *   注意: 「Hide 6 replies」のような開いた状態の文言も 6 と読む。たたまれたスレッドの文言だけ渡すか、
 *   countUnreadReplies の loadedReplies で読めた分を引くこと。
 * @param {unknown} text
 * @returns {number | null}
 */
export function parseYtReplyCountLabel(text) {
  if (typeof text !== 'string') return null;
  const s = normalizeLabel(text);
  if (s === '') return null;
  if (/^view repl(?:y|ies)$/i.test(s)) return 1;
  if (!s.includes('返信') && !/repl(?:y|ies)/i.test(s)) return null;
  const m = s.match(/(\d[\d,]*(?:\.\d+)?)\s*(k|m|万)?/i);
  if (!m) return null;
  const base = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(base)) return null;
  const unit = (m[2] || '').toLowerCase();
  const multiplier = unit === 'k' ? 1_000 : unit === 'm' ? 1_000_000 : unit === '万' ? 10_000 : 1;
  return Math.round(base * multiplier);
}

/**
 * スレッドごとの「返信の文言」と「読めた返信の数」から、まだ読めていない返信の合計を出す。
 *   読めた数のほうが多いスレッドは 0。文言が読めないスレッドは数えない。
 * @param {readonly { label?: unknown, loadedReplies?: unknown }[] | null | undefined} threads
 * @returns {number}
 */
export function countUnreadReplies(threads) {
  if (!Array.isArray(threads)) return 0;
  let sum = 0;
  for (const thread of threads) {
    if (!thread || typeof thread !== 'object') continue;
    const total = parseYtReplyCountLabel(thread.label);
    if (total == null) continue;
    const loaded = Number(thread.loadedReplies);
    const loadedCount = Number.isFinite(loaded) && loaded > 0 ? loaded : 0;
    sum += Math.max(0, total - loadedCount);
  }
  return sum;
}

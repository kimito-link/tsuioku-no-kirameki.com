/**
 * 配信者 userId を embedded-data / DOM から純粋関数で抽出する。
 *
 * 0.1.38 (T): lv350420992 で発生した「streamLink が誤った user リンクを
 *   拾い、broadcasterUserId が本配信者と別人になる」事件の対策。
 *
 * 背景:
 *   ニコ生 watch ページの DOM には `/user/{id}/live_programs` 形式の
 *   anchor が複数含まれる場合がある（コメ欄の他配信者言及や、過去配信履歴
 *   ウィジェット等）。従来は `document.querySelectorAll('a[href*="/user/"]')`
 *   で先頭 hit の href から uid を取り出していたが、これだと「本配信者の
 *   ページに飛ばない」現象が起きていた。
 *
 *   embedded-data の `program.supplier.programProviderId` は配信者本人を
 *   指す authoritative なソースなので、これを最優先にする。
 *
 * 優先順位:
 *   1. embedded-data `program.supplier.programProviderId` (数値文字列)
 *   2. embedded-data `program.supplier.id` (数値文字列)
 *   3. embedded-data `program.supplier.pageUrl` の /user/(\d+)/
 *   4. DOM streamLink href の /user/(\d+)/  ← 最後の手段
 *
 *   1〜3 は authoritative なので、4 が裏で違う値を返しても勝つ。
 *   チャンネル放送（pageUrl が ch.nicovideo.jp/...）は uid 取れずに ''。
 */

/**
 * @typedef {{
 *   embeddedSupplierProgramProviderId?: unknown,
 *   embeddedSupplierId?: unknown,
 *   embeddedSupplierPageUrl?: unknown,
 *   streamLinkHref?: unknown
 * }} ExtractBroadcasterUserIdInput
 */

/**
 * @param {unknown} v
 * @returns {string}
 */
function asTrimmedString(v) {
  if (v == null) return '';
  return String(v).trim();
}

/**
 * @param {string} s
 * @returns {boolean}
 */
function isAllDigits(s) {
  return s.length > 0 && /^\d+$/.test(s);
}

/**
 * @param {string} url
 * @returns {string}
 */
function pickUserIdFromUrl(url) {
  if (!url) return '';
  const m = url.match(/\/user\/(\d+)/);
  return m ? m[1] : '';
}

/**
 * @param {ExtractBroadcasterUserIdInput} [input]
 * @returns {string}
 */
export function extractBroadcasterUserId(input) {
  if (!input || typeof input !== 'object') return '';

  // 1. supplier.programProviderId（最優先 — embedded-data 内で配信者本人を指す）
  const ppid = asTrimmedString(input.embeddedSupplierProgramProviderId);
  if (isAllDigits(ppid)) return ppid;

  // 2. supplier.id（programProviderId が無い場合のフォールバック）
  const sid = asTrimmedString(input.embeddedSupplierId);
  if (isAllDigits(sid)) return sid;

  // 3. supplier.pageUrl から /user/{id}/
  const pageUrl = asTrimmedString(input.embeddedSupplierPageUrl);
  const fromPageUrl = pickUserIdFromUrl(pageUrl);
  if (fromPageUrl) return fromPageUrl;

  // 4. DOM streamLink href から /user/{id}/  ← 最後の手段、誤検出リスクあり
  const streamHref = asTrimmedString(input.streamLinkHref);
  const fromStream = pickUserIdFromUrl(streamHref);
  if (fromStream) return fromStream;

  return '';
}

/**
 * 評判チェック用に「配信者名」を解決する純関数 (PR R4)
 *
 * status-entry.js が読む panel_summary(nls_panel_summary_<lv>)の broadcasterName
 * から、評判チェックのクエリにする配信者名を取り出す。
 *
 * 設計 ([[reference_broadcaster_reputation_check_from_dns_osint]] §3 R4):
 *   - broadcasterName のみ採用。title(番組名)では代替しない
 *     = 番組名は毎回変わり「配信者の評判」検索として精度が落ちるため。
 *   - 「(配信者名 不明)」等のプレースホルダは採用しない。
 *   - chrome.* 非依存 = lib でテスト可能。実際の storage 読みは status-entry 側。
 */

const PANEL_SUMMARY_PREFIX = 'nls_panel_summary_';
const MAX_QUERY_LEN = 100;

// 配信者名として無効なプレースホルダ (statusFormat の「(配信者名 不明)」等)
const PLACEHOLDER_RE = /配信者名\s*不明|不明|^[-—–]+$/;

/**
 * 配信者名クエリを正規化する (trim / 連続空白圧縮 / 長さ上限)。
 * @param {unknown} name
 * @returns {string}
 */
export function sanitizeBroadcasterQuery(name) {
  if (typeof name !== 'string') return '';
  const compact = name.replace(/\s+/g, ' ').trim();
  return compact.slice(0, MAX_QUERY_LEN);
}

/**
 * @param {string} raw
 * @returns {boolean} 配信者名として妥当か
 */
function isUsableName(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return false;
  if (PLACEHOLDER_RE.test(s)) return false;
  return true;
}

/**
 * summaries(chrome.storage.local.get の結果バッグ)から配信者名を解決する。
 * 指定 lv を優先し、無ければ任意の有効な broadcasterName を拾う。
 * @param {{ summaries?: Record<string, any>, lv?: string }} input
 * @returns {string} 配信者名 (無ければ '')
 */
export function pickBroadcasterNameForReputation(input) {
  const summaries =
    input && typeof input === 'object' && input.summaries && typeof input.summaries === 'object'
      ? input.summaries
      : null;
  if (!summaries) return '';

  const lv = String(input?.lv ?? '')
    .trim()
    .toLowerCase();

  // 1) 指定 lv を優先
  if (lv) {
    const s = summaries[PANEL_SUMMARY_PREFIX + lv];
    const name = s && typeof s === 'object' ? s.broadcasterName : '';
    if (isUsableName(name)) return sanitizeBroadcasterQuery(name);
  }

  // 2) 任意の有効な broadcasterName
  for (const key of Object.keys(summaries)) {
    if (!key.startsWith(PANEL_SUMMARY_PREFIX)) continue;
    const s = summaries[key];
    const name = s && typeof s === 'object' ? s.broadcasterName : '';
    if (isUsableName(name)) return sanitizeBroadcasterQuery(name);
  }

  return '';
}

/**
 * HTML レポート / マーケ分析の各ユーザー行に「最低サムネ」を必ず出すための
 * 解決ルール。優先順位は以下の通り：
 *
 *   1. 渡された avatarUrl が http/https → そのまま採用（プロフィール由来など）
 *   2. userId が数値（5〜14 桁）→ ニコ既定 user icon CDN URL（バケット計算）
 *   3. userId が匿名（a:.../長い英数字）→ identiconResolver が返す SVG data URL
 *   4. 上記いずれも該当しない → 空文字（呼び出し側で「無し」プレースホルダ）
 *
 * Security:
 *   - data:/javascript:/blob: の avatarUrl は採用しない（保存 HTML 開封時の
 *     XSS 経路を断つ）。識別は isHttpOrHttpsUrl に委譲。
 *   - 数値 ID の桁数を 5〜14 に絞り、3〜4 桁の lv 番号などを誤って bucket 化
 *     しないようにする。
 *
 * 純粋関数のみで DOM/storage には触らない（vitest 単体検証用）。
 */

import { isHttpOrHttpsUrl } from './supportGrowthTileSrc.js';

const NICO_USER_ICON_CDN_BASE =
  'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon';

/**
 * 数値 userId からニコ既定の user icon CDN URL を組む。
 * niconico の慣行: bucket = floor(uid / 10000) で、`<base>/<bucket>/<uid>.jpg`。
 * 5〜14 桁の数値以外（匿名・空・lv 短番号）は安全側で空文字。
 *
 * @param {unknown} uid
 * @returns {string}
 */
export function buildNiconicoDefaultUserIconUrl(uid) {
  const s = String(uid || '').trim();
  if (!/^\d{5,14}$/.test(s)) return '';
  const bucket = Math.floor(Number(s) / 10000);
  return `${NICO_USER_ICON_CDN_BASE}/${bucket}/${s}.jpg`;
}

/**
 * @param {{
 *   userId: unknown,
 *   avatarUrl: unknown,
 *   identiconResolver?: (uid: string) => string
 * }} opts
 * @returns {string}
 */
export function resolveReportUserThumbSrc(opts) {
  const userId = String(opts?.userId || '').trim();
  const avatarUrl = String(opts?.avatarUrl || '').trim();
  if (isHttpOrHttpsUrl(avatarUrl)) {
    return avatarUrl;
  }
  if (!userId || userId === '__unknown__') return '';
  // 数値 5〜14 桁: ニコ既定 CDN URL
  if (/^\d{5,14}$/.test(userId)) {
    return buildNiconicoDefaultUserIconUrl(userId);
  }
  // 匿名（a:... / ハッシュ系）: identicon resolver が居れば SVG data URL
  if (typeof opts?.identiconResolver === 'function') {
    const r = opts.identiconResolver(userId);
    if (typeof r === 'string' && r.length > 0) return r;
  }
  return '';
}

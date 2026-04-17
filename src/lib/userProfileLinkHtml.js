/**
 * 応援コメントの各種 HTML 出力（マーケティング HTML・HTML 保存レポート等）で、
 * 数値 ID を持つユーザーの表示名を niconico ユーザーページへのリンクで包むための純粋ヘルパ。
 *
 * - 匿名 (a:xxxx) やハッシュ系 ID はリンクにしない（プロフィールページが無い）
 * - 未取得 (UNKNOWN_USER_KEY / 空) もリンクにしない
 * - それ以外の数値 ID は `https://www.nicovideo.jp/user/<uid>` を target="_blank" で開く
 *
 * DOM / location に触らないため、node 側テストでそのまま検証できる。
 */

import { escapeAttr, escapeHtml } from './htmlEscape.js';
import { buildCommentTickerNameHref } from './commentTickerNameLink.js';

/**
 * 表示ラベル（既に組み立て済みの「ニックネーム（shortId）」等）をリンクで包んだ HTML を返す。
 * リンク対象でない場合は escape した文字列だけを返す。
 *
 * @param {string | null | undefined} userKey ユーザー ID（数値 ID のときだけリンク化）
 * @param {string | null | undefined} label  画面に出す表示テキスト（escape 前でよい）
 * @returns {string}
 */
export function buildUserProfileLinkedLabelHtml(userKey, label) {
  const text = String(label ?? '');
  const escaped = escapeHtml(text);
  const href = buildCommentTickerNameHref(userKey);
  if (!href) return escaped;
  return (
    `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer"` +
    ` class="nl-user-profile-link">${escaped}</a>`
  );
}

/**
 * マーケティング HTML 側で使うショートカット:
 *   {nickname, userId} を 1 行の表示名にまとめて、リンクで包む。
 *   nickname が空なら userId（未取得なら '—'）で代替する。
 *
 * @param {{ userId?: string | null | undefined, nickname?: string | null | undefined }} p
 * @returns {string}
 */
export function buildMarketingUserLabelLinkedHtml(p) {
  const uid = String(p?.userId ?? '').trim();
  const nick = String(p?.nickname ?? '').trim();
  const label = nick || uid || '—';
  return buildUserProfileLinkedLabelHtml(uid, label);
}

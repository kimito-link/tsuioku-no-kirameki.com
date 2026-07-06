/**
 * コメント送信コンテキストだけを、表示用の「実質アクティブ watch」判定から分離して解決する。
 *
 * 背景（2026-07-06 実測: 2日連続・実配信）:
 *   watch タブは開いており、実際の送信 requestPostCommentToOpenTab は
 *   collectWatchTabCandidates（開いている watch タブを tabs.query で探す）で
 *   送れるはずなのに、送信ボタンは「watchページを開くとコメント送信できます」で
 *   灰色のままだった。
 *
 *   真因は v0.1.424 の設計判断（意図的・維持する）: pickWatchUrlFromMultipleSources の
 *   結果が `source === 'storage' | 'dataBacked' | 'none'` のとき、popup-entry.js は
 *   treatAsNoActiveWatch=true として扱い、応援者一覧などの「実質アクティブ表示」を
 *   別タブの記録に誤同期させない。これは表示の誤情報防止としては正しいが、
 *   「コメント送信できるか」は別の関心＝開いている watch タブが1件でもあれば
 *   送信は成立する。表示系の抑制がそのまま送信系の抑制に流用されていたのが本バグ。
 *
 *   この関数は「開いている watch タブ候補（collectWatchTabCandidates 相当）」と
 *   「現在の表示文脈の liveId（あれば）」から、送信先として使う watch URL / liveId を
 *   選ぶ純粋関数。chrome 非依存でテスト可能にする。
 *
 * 選択ロジック:
 *   0件   → no_watch（従来どおり disabled）
 *   1件   → その候補を採用
 *   複数件 → 現在表示中の liveId と一致する候補があればそれを優先、
 *            無ければ候補配列の先頭（呼び出し側で prioritizeWatchTabCandidates 済みを渡す想定）
 */

import { extractLiveIdFromUrl } from './broadcastUrl.js';

/**
 * @typedef {{ id?: number, url: string }} WatchTabCandidateLike
 */

/**
 * @typedef {{
 *   url: string,
 *   liveId: string
 * }} CommentPostWatchTarget
 */

const EMPTY_TARGET = Object.freeze({ url: '', liveId: '' });

/**
 * @param {WatchTabCandidateLike[] | null | undefined} candidates
 *   開いている watch タブ候補（既に優先順にソート済みのものを渡す想定。
 *   最優先候補が先頭に来ていれば十分で、このタブ内バックアップソートはしない）。
 * @param {string | null | undefined} currentLiveId
 *   現在の表示文脈の liveId（例: exportBtn.dataset.liveId）。分かれば複数候補の
 *   タイブレークに使う。空でも動作する（その場合は先頭候補を採用）。
 * @returns {CommentPostWatchTarget}
 */
export function resolveCommentPostWatchTarget(candidates, currentLiveId) {
  const list = Array.isArray(candidates) ? candidates : [];
  /** @type {{ url: string, liveId: string }[]} */
  const normalized = [];
  for (const c of list) {
    const url = String(c?.url || '').trim();
    if (!url) continue;
    const liveId = String(extractLiveIdFromUrl(url) || '').trim().toLowerCase();
    normalized.push({ url, liveId });
  }
  if (normalized.length === 0) return EMPTY_TARGET;
  if (normalized.length === 1) return normalized[0];

  const wantLiveId = String(currentLiveId || '').trim().toLowerCase();
  if (wantLiveId) {
    const match = normalized.find((c) => c.liveId === wantLiveId);
    if (match) return match;
  }
  return normalized[0];
}

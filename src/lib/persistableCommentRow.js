/**
 * v0.1.362: DOM ハーベスト経路で拾ったコメント行を `nls_comments_<lv>` に保存して
 * よいかを判定する純関数。
 *
 * 経緯:
 *   コメント記録には2系統ある。
 *   - NDGR 経路: cleanNdgrChatRows / ndgrChatRows が parseGiftCommentText で
 *     「○○さんがギフト「XXX（Npt）」を贈りました」のギフトシステム行を除外済み。
 *   - DOM ハーベスト経路: persistCommentRows（content-entry の deep/visible/mutation
 *     の3経路が共有）には除外が無く、NDGR ギフト event を取り逃した配信で、コメント
 *     テーブルに表示されたギフト行が通常コメントとして保存され「ユーザー別応援件数」に
 *     混入し得た（NDGR/DOM の非対称）。
 *
 *   両系統で同じ除外規約を共有するため、判定を純関数に切り出して単体テストで固定する。
 *   除外対象:
 *   - おすすめ生 / コメント UI スクレイプ由来の汚染行（isCommentUiScraperPollutionRow）
 *   - ギフトシステム行（parseGiftCommentText が gift と判定する text）
 *
 * 副作用なし。
 *
 * @see src/lib/backfillRemoveRecommendedLivePollution.js - isCommentUiScraperPollutionRow
 * @see src/lib/parseGiftComment.js - parseGiftCommentText
 */

import { isCommentUiScraperPollutionRow } from './backfillRemoveRecommendedLivePollution.js';
import { parseGiftCommentText } from './parseGiftComment.js';

/**
 * @param {{ text?: unknown }|null|undefined} row
 * @returns {boolean} 保存してよい通常コメント行なら true、汚染/ギフト行なら false
 */
export function isPersistableHarvestedCommentRow(row) {
  if (isCommentUiScraperPollutionRow(row)) return false;
  if (parseGiftCommentText(String(row?.text ?? ''))) return false;
  return true;
}

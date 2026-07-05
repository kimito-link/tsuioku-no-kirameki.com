// commentPostDiagKey.js
// コメント送信(requestPostCommentToOpenTab)の「所要ms/結果/リトライ回数」観測値を
//   popup-entry.js が書き、status が読む storage キー。
//   opSoundEffectDiagKey.js / voiceEffectDiagKey.js と同じ方式
//   (純観測値を書く→状態速報が行に再表示。切り分けは状態速報のコピペで行う)。
// 目的(2026-07-06実機症状): 「送信中…」張り付き・自コメ「一瞬載って消える」の切り分けに、
//   総所要ms・結果種別(ok/fail/timeout)・リトライ回数を状態速報1枚で確認できるようにする。

/** コメント送信診断の storage キー(local only・観測値=件数/msだけで PII を含めない)。 */
export const KEY_COMMENT_POST_DIAG = 'nls_comment_post_diag_v1';

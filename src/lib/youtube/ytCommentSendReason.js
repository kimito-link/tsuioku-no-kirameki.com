// ytCommentSendReason.js — YouTube のチャットへ送れなかった理由コード(content-chat-entry が返す)を日本語にする。
//   サイドパネルの「コメント送信」と会場の「ここから発言」で同じ文言を使う。

export const YT_COMMENT_SEND_REASON_JA = Object.freeze({
  'no-tab': 'この配信の YouTube タブが見つかりません。視聴ページを開いてください。',
  'no-chat-frame': 'チャット欄が見つかりません。視聴ページでチャットを表示してください。',
  'no-input': 'チャットの入力欄がありません（チャットが閉じている・アーカイブ・コメント制限中かもしれません）。',
  'not-signed-in': 'YouTube にログインしていないので送れません。YouTube 側でログインしてください。',
  // 0.1.1905: メンバー限定・登録者限定などの帯。ログインしていても出るので「ログインしていない」とは言わない。
  'chat-restricted': 'この配信のチャットは制限されています（メンバー限定・チャンネル登録者限定など）。',
  'no-send-button': '送信ボタンが見つかりません。YouTube の画面が変わったかもしれません。',
  'send-disabled': 'YouTube 側で送信できない状態です（低速モード・メンバー限定など）。',
  'still-in-box': '送信ボタンを押しましたが、文字が入力欄に残っています。YouTube 側の画面を確認してください。',
  empty: 'コメントが空です。',
});

/**
 * @param {string} reason
 * @param {string} [note] YouTube 側の案内文(chat-restricted のときに添える)
 * @returns {string} 知らない理由なら ''
 */
export function ytCommentSendReasonText(reason, note) {
  const base = /** @type {Record<string,string>} */ (YT_COMMENT_SEND_REASON_JA)[String(reason || '')] || '';
  const n = String(note || '').trim();
  if (base && n && reason === 'chat-restricted') return `${base}YouTube の案内:「${n}」`;
  return base;
}

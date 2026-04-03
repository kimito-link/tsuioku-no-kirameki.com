/** ニコ生コメント欄の最大文字数（textarea maxlength と一致） */
export const VOICE_COMMENT_MAX_CHARS = 250;

/** @returns {boolean} */
export function isVoiceCommentSupported() {
  if (typeof window === 'undefined') return false;
  const C = window.SpeechRecognition || window.webkitSpeechRecognition;
  return typeof C === 'function';
}

/**
 * SpeechRecognition の onresult 用。sessionFinalsSoFar に今回の確定分を足し、表示文字列を返す。
 * @param {string} sessionBase セッション開始時点の入力内容
 * @param {string} sessionFinalsSoFar このセッションで確定済みの全文
 * @param {SpeechRecognitionEvent} e
 * @returns {{ sessionFinals: string, display: string }}
 */
export function applyRecognitionResult(sessionBase, sessionFinalsSoFar, e) {
  let finals = sessionFinalsSoFar;
  let interim = '';
  const { results } = e;
  for (let i = e.resultIndex; i < results.length; i++) {
    const seg =
      typeof results.item === 'function'
        ? results.item(i)
        : /** @type {SpeechRecognitionResult} */ (results[i]);
    if (!seg) continue;
    const alt = seg[0];
    const t = alt?.transcript ?? '';
    if (seg.isFinal) finals += t;
    else interim += t;
  }
  const display = (sessionBase + finals + interim).trim().slice(0, VOICE_COMMENT_MAX_CHARS);
  return { sessionFinals: finals, display };
}

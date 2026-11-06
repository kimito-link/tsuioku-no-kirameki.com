// ytChatInputBlock.js — YouTube のチャット欄に入力欄が無いとき、その理由を見分ける(content-chat-entry の「ここから発言」用)。
//
// 0.1.1908: ログインしているのに「ログインしていないので送れません」と出た(りんく 2026-11-06・前の放送。別の配信では送れた)。
//   以前は yt-live-chat-restricted-participation-renderer(メンバー限定・登録者限定などでチャットが制限されているときの帯)が
//   あるだけで「ログインしていない」と判定していた。この帯はログインしていても出る。
//   「ログインしていない」と言うのは、ログインの入口(ServiceLogin / accounts.google.com のリンク・「ログインしてチャット」の文言)が
//   見えたときだけにする。制限の帯だけなら「チャットが制限されている」と伝え、YouTube 側の案内文も添える。

const SIGN_IN_LINK_SEL = 'a[href*="ServiceLogin"], a[href*="accounts.google.com"]';
const SIGN_IN_TEXT_RE = /ログインしてチャット|Sign in to chat/i;

/** @param {Element | null | undefined} el */
function textOf(el) {
  return String(el?.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * @param {ParentNode} doc
 * @returns {{ reason: 'not-signed-in' | 'chat-restricted' | 'no-input', note: string }}
 *   note = YouTube 側の案内文(最大120字・無ければ '')
 */
export function classifyYtChatInputBlock(doc) {
  const panel = doc.querySelector('#input-panel');
  const restricted = doc.querySelector('yt-live-chat-restricted-participation-renderer');
  const inputRenderer = doc.querySelector('yt-live-chat-message-input-renderer');
  const scopes = /** @type {Element[]} */ ([panel, restricted, inputRenderer].filter(Boolean));
  const signedOut = scopes.some(
    (el) => !!el.querySelector(SIGN_IN_LINK_SEL) || SIGN_IN_TEXT_RE.test(textOf(el)),
  );
  if (signedOut) {
    return { reason: 'not-signed-in', note: '' };
  }
  if (restricted) {
    const msgEl = restricted.querySelector('#message, #explanation, yt-formatted-string') || restricted;
    return { reason: 'chat-restricted', note: textOf(msgEl).slice(0, 120) };
  }
  return { reason: 'no-input', note: textOf(panel).slice(0, 120) };
}

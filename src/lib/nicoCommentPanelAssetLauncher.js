/**
 * ニコ生 watch のコメント欄付近から「ギフト / アイテム / スタンプ」等の起動ボタンを推定する。
 * DOM 構造変更に備え、文言・aria・data-testid を弱結合でスコアリングする。
 */

/** ギフト／アイテム／スタンプ系の明示キーワード（「贈る」単独は誤爆しやすいので含めない） */
const ASSET_LAUNCHER_HINT_RE =
  /(アイテム|ギフト|スタンプ|絵文字|gift|item|stamp|emoji|ワンコイン|投げ|盛り上げ)/i;

const ASSET_LAUNCHER_GIFT_VERB_RE = /(贈る|送る)/i;
const ASSET_LAUNCHER_GIFT_NOUN_RE = /(ギフト|アイテム|スタンプ|gift|item|stamp)/i;

const ASSET_LAUNCHER_NEGATIVE_LABEL_RE =
  /(コメント.{0,8}(送信|投稿)|^送信$|^投稿$|submit|send|post|書き込|書込|再読み込み|reload|閉じ|close|cancel|設定|settings)/i;

const ASSET_LAUNCHER_NEGATIVE_TOKEN_RE =
  /(comment-post|commentPost|send-comment|submit-comment|reload|close)/i;

/**
 * @param {Element|null|undefined} el
 * @returns {el is HTMLElement}
 */
function isHtmlElement(el) {
  return el instanceof HTMLElement;
}

/**
 * @param {HTMLElement} el
 * @returns {boolean}
 */
export function isVisibleAssetLauncherCandidate(el) {
  if (!isHtmlElement(el) || !el.isConnected || el.hidden) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (typeof el.getClientRects === 'function' && el.getClientRects().length === 0) {
    return false;
  }
  return true;
}

/**
 * @param {HTMLElement} el
 * @returns {boolean}
 */
function isDisabledAssetLauncher(el) {
  if (el.matches('[disabled],[aria-disabled="true"]')) return true;
  if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) {
    return el.disabled;
  }
  return false;
}

/**
 * @param {HTMLElement} el
 * @returns {string}
 */
function readPrimaryLabel(el) {
  const parts = [];
  for (const key of ['aria-label', 'title']) {
    const v = String(el.getAttribute(key) || '').trim();
    if (v) parts.push(v);
  }
  if (el instanceof HTMLInputElement) {
    const v = String(el.value || '').trim();
    if (v) parts.push(v);
  }
  const text = String(el.textContent || '').trim();
  if (text && text.length <= 80) parts.push(text);
  return parts.join(' ').trim();
}

/**
 * @param {HTMLElement} el
 * @returns {string}
 */
function readTokenBlob(el) {
  const parts = [];
  for (const key of ['id', 'name', 'class', 'data-testid', 'data-test-id']) {
    const v = String(el.getAttribute(key) || '').trim();
    if (v) parts.push(v);
  }
  return parts.join(' ').trim();
}

/**
 * @param {HTMLElement} el
 * @param {HTMLElement|null} editor
 * @returns {number}
 */
export function scoreCommentPanelAssetLauncher(el, editor) {
  let score = 0;
  const label = readPrimaryLabel(el);
  const tokens = readTokenBlob(el);

  if (ASSET_LAUNCHER_NEGATIVE_LABEL_RE.test(label)) score -= 280;
  if (ASSET_LAUNCHER_NEGATIVE_TOKEN_RE.test(tokens)) score -= 220;

  if (ASSET_LAUNCHER_HINT_RE.test(label)) score += 120;
  if (ASSET_LAUNCHER_HINT_RE.test(tokens)) score += 90;
  const blob = `${label} ${tokens}`;
  if (
    ASSET_LAUNCHER_GIFT_VERB_RE.test(blob) &&
    ASSET_LAUNCHER_GIFT_NOUN_RE.test(blob)
  ) {
    score += 95;
  }

  const editorForm = editor?.closest('form') || null;
  const buttonForm = el.closest('form');
  if (editorForm && buttonForm === editorForm) score += 70;
  else if (editor && el.closest('.ga-ns-comment-panel, .comment-panel') === editor.closest('.ga-ns-comment-panel, .comment-panel')) {
    score += 45;
  }

  if (editor?.parentElement && el.parentElement === editor.parentElement) {
    score += 25;
  }

  return score;
}

const CANDIDATE_SELECTOR = 'button, [role="button"], a[href]';

/**
 * ギフト／投げ／アイテム起動ボタンを探す DOM スコープ。
 * ニコ生では textarea が入った form と、投げボタンが兄弟ツリーで form の外
 * に置かれることがあり、`form` だけを走査するとボタンを取り逃がす。
 * そのため **コメントパネル（広い祖先）を form より優先**する。
 *
 * @param {HTMLElement|null|undefined} editor
 * @returns {ParentNode}
 */
export function resolveCommentPanelAssetSearchScope(editor) {
  if (!(editor instanceof HTMLElement)) return document;
  return (
    editor.closest('.ga-ns-comment-panel, .comment-panel, [class*="comment-panel" i]') ||
    editor.closest('form') ||
    document
  );
}

/**
 * @param {ParentNode} root
 * @param {HTMLElement|null} [editor]
 * @returns {HTMLElement|null}
 */
export function findCommentPanelAssetLauncherButton(root, editor = null) {
  if (!root || typeof root.querySelectorAll !== 'function') return null;

  /** @type {HTMLElement|null} */
  let best = null;
  let bestScore = -Infinity;

  const list = root.querySelectorAll(CANDIDATE_SELECTOR);
  for (const node of list) {
    if (!(node instanceof HTMLElement)) continue;
    if (!isVisibleAssetLauncherCandidate(node)) continue;
    if (isDisabledAssetLauncher(node)) continue;
    const s = scoreCommentPanelAssetLauncher(node, editor);
    if (s > bestScore) {
      bestScore = s;
      best = node;
    }
  }

  return bestScore >= 80 ? best : null;
}

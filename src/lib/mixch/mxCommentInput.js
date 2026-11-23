// mxCommentInput.js — ミクチャの公式コメント欄を探す(会場の「ここから発言」は拾わない)。
//   2026-11-23 公式 JS(torte_web)と未ログイン実測:
//   右欄のギフト一覧の直前がコメント枠(.e5x5d221)。ログイン中は form に入っていない
//   textarea(emotion: ehsyv870、枠は e10cxjj00 / .textarea-wrapper、placeholder は
//   「コメントする...」、送信は button.submit-btn)。高さ用の見えないダミー textarea が
//   body 直下に1つ置かれる。未ログインでは textarea は無く「コメントするにはログインしてください」の div だけ。
//   送り方そのものは SHOWROOM / YouTube と同じ共通経路。ここは公式欄の探し方だけを担う。
//   欄の節は覚えず毎回探す。高さや矩形の下限では落とさない(サイドパネルで欄が小さくなる)。
//   見た目の「コメントする...」が placeholder 属性でない・SimpleBar や open shadow の中に
//   ある、など今の DOM のゆらぎでも公式の欄を拾う。
// @layer L1 — DOM を読む / 会場をしまう印は付け外しだけ
import { isOwnExtensionUi, findPageButton } from '../platform/pageControlPick.js';
export { revealVenueOfficialComposer as revealMxOfficialComposer } from '../venueRevealOfficialComposer.js';

/** 公式の欄らしいセレクタ(form に入っていない textarea も拾う) */
export const MX_INPUT_SEL =
  'textarea[placeholder*="コメント"], input[placeholder*="コメント"], textarea[placeholder*="メッセージ"], input[placeholder*="メッセージ"], textarea[placeholder*="댓글"], input[placeholder*="댓글"], .textarea-wrapper textarea, .e10cxjj00 textarea, .ehsyv870, div.column.right textarea, [role="textbox"], form textarea, form input[type="text"]';

/** 公式のコメント枠(ギフト欄の直前)。emotion の target 名はビルドが変わると変わるので、合わせてクラス名・構造でも探す */
export const MX_COMPOSER_SEL = '.e10cxjj00, .textarea-wrapper, .e5x5d221, .ehsyv870';

const PLACEHOLDER_RE = /コメント|メッセージ|댓글|comment/i;
const LOGIN_PROMPT_RE = /ログインしてください|로그인이 필요/;
const DISABLED_PROMPT_RE = /無効になっています|비활성화/;
const GIFT_SEND_RE = /^\s*送信する\s*$/;
const COMMENT_SEND_RE = /^\s*送信\s*$/;

/**
 * ミクチャが文字の高さ用に置く、見えないダミー欄か。
 * @param {Element | null | undefined} el
 * @returns {boolean}
 */
export function isMxDummyAutosizeField(el) {
  if (!el || el.tagName !== 'TEXTAREA') return false;
  // 公式の欄は、サイドパネルで高さが小さくなっても計測用ダミーではない。
  //   高さや矩形の下限では落とさない。公式枠・「コメントする」なら本物。
  if (el.closest && el.closest('.textarea-wrapper, .e10cxjj00, .ehsyv870, .e5x5d221')) return false;
  const label = fieldLabel(el);
  if (PLACEHOLDER_RE.test(label)) return false;
  const ariaHidden = el.getAttribute('aria-hidden') === 'true';
  const tabIndex = el.getAttribute('tabindex');
  const style = String(el.getAttribute('style') || '');
  const parentIsBody = !!(el.parentElement && el.parentElement.tagName === 'BODY');
  if (parentIsBody) {
    const vis = typeof getComputedStyle === 'function' ? getComputedStyle(el).visibility : '';
    const z = typeof getComputedStyle === 'function' ? getComputedStyle(el).zIndex : '';
    if (vis === 'hidden' || (Number(z) < 0 && Number.isFinite(Number(z)))) return true;
    if (/visibility:\s*hidden/i.test(style) || /z-index:\s*-\d/i.test(style)) return true;
    // 高さ0だけでは落とさない。body 直下かつ隠し印があるときだけダミー。
    if (ariaHidden || tabIndex === '-1') return true;
  }
  if (ariaHidden && (parentIsBody || tabIndex === '-1' || /visibility:\s*hidden/i.test(style) || /z-index:\s*-\d/i.test(style))) {
    return true;
  }
  return false;
}

export function isMxVisibleField(el) {
  if (!el || typeof el.getClientRects !== 'function') return false;
  return el.getClientRects().length > 0;
}

/**
 * ログイン案内・チャット無効の文言だけを示す要素か(入力欄ではない)。
 * @param {Element | null | undefined} el
 * @returns {boolean}
 */
export function isMxCommentPromptOnly(el) {
  if (!el) return false;
  const t = String(el.textContent || '').replace(/\s+/g, ' ').trim();
  if (!t) return false;
  if (LOGIN_PROMPT_RE.test(t) || DISABLED_PROMPT_RE.test(t)) {
    // 枠の中に本物の入力があれば案内ではない
    if (el.querySelector && el.querySelector('textarea, input, [contenteditable="true"], [role="textbox"]')) return false;
    return true;
  }
  return false;
}

/**
 * @param {Element} el
 * @returns {string}
 */
function fieldLabel(el) {
  return `${el.getAttribute('placeholder') || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('data-placeholder') || ''} ${el.getAttribute('title') || ''}`;
}

/**
 * @param {Element | null | undefined} el
 * @returns {boolean}
 */
function isTypeableField(el) {
  if (!el || isOwnExtensionUi(el) || isMxDummyAutosizeField(el) || isMxCommentPromptOnly(el)) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const typ = String(el.getAttribute('type') || 'text').toLowerCase();
    return typ === 'text' || typ === 'search' || typ === '';
  }
  if (el.getAttribute && (el.getAttribute('role') === 'textbox' || el.getAttribute('contenteditable') === 'true')) return true;
  if (/** @type {any} */ (el).isContentEditable) return true;
  return false;
}

/**
 * @param {ParentNode} root
 * @param {number} [depth]
 * @returns {ParentNode[]}
 */
function collectSearchRoots(root, depth = 0) {
  /** @type {ParentNode[]} */
  const out = [root];
  if (depth > 5 || !root || typeof root.querySelectorAll !== 'function') return out;
  try {
    for (const el of Array.from(root.querySelectorAll('*'))) {
      if (isOwnExtensionUi(/** @type {Element} */ (el))) continue;
      const shadow = /** @type {any} */ (el).shadowRoot;
      if (shadow && typeof shadow.querySelectorAll === 'function') {
        out.push(...collectSearchRoots(shadow, depth + 1));
      }
    }
  } catch {
    /* 読めない shadow は飛ばす */
  }
  try {
    for (const f of Array.from(root.querySelectorAll('iframe'))) {
      try {
        const doc = /** @type {HTMLIFrameElement} */ (f).contentDocument;
        if (doc && doc !== root) out.push(...collectSearchRoots(doc, depth + 1));
      } catch {
        /* 別オリジン */
      }
    }
  } catch {
    /* iframe 一覧が取れなくても本文は探す */
  }
  return out;
}

/**
 * @param {ParentNode} scope
 * @returns {Element[]}
 */
function queryFieldsIn(scope) {
  if (!scope || typeof scope.querySelectorAll !== 'function') return [];
  /** @type {Element[]} */
  const found = [];
  const seen = new Set();
  const add = (/** @type {Element | null} */ el) => {
    if (!el || seen.has(el) || !isTypeableField(el)) return;
    seen.add(el);
    found.push(el);
  };
  try {
    for (const el of Array.from(scope.querySelectorAll(MX_INPUT_SEL))) add(/** @type {Element} */ (el));
  } catch {
    /* セレクタが古い環境で落ちても、下の広めの探索は続ける */
  }
  try {
    for (const el of Array.from(scope.querySelectorAll('textarea, input, [contenteditable="true"], [role="textbox"]'))) {
      add(/** @type {Element} */ (el));
    }
  } catch {
    /* no-op */
  }
  return found;
}

/**
 * @param {Element} el
 * @returns {number}
 */
function isNearOfficialSend(el) {
  let n = el;
  for (let i = 0; n && i < 8; i += 1) {
    if (typeof n.querySelector === 'function') {
      const b = n.querySelector('button.submit-btn');
      if (b && !isOwnExtensionUi(b) && !GIFT_SEND_RE.test(String(b.textContent || '').replace(/\s+/g, ' ').trim())) return true;
    }
    n = /** @type {any} */ (n).parentElement;
  }
  return false;
}

/**
 * サイト内の検索欄などを公式コメントと取り違えない。
 * @param {Element} el
 */
function nearbyOfficialText(el) {
  let t = fieldLabel(el);
  const box = el.closest && el.closest('.e10cxjj00, .textarea-wrapper, .e5x5d221, .ehsyv870, .column.right');
  if (box) t += ' ' + String(box.textContent || '');
  return t;
}

function isLikelyOfficialField(el) {
  if (!isTypeableField(el)) return false;
  if (el.closest && el.closest('#tab-boxes, .gift-menu-header, .icon-list')) return false;
  const label = nearbyOfficialText(el);
  if (PLACEHOLDER_RE.test(label) && !LOGIN_PROMPT_RE.test(label)) return true;
  if (el.closest && el.closest('.e10cxjj00, .textarea-wrapper, .ehsyv870, .e5x5d221')) return true;
  if (isNearOfficialSend(el)) return true;
  return false;
}

function scoreField(el) {
  let score = 0;
  const label = fieldLabel(el);
  if (PLACEHOLDER_RE.test(label)) score += 80;
  if (el.closest && el.closest('.e10cxjj00, .textarea-wrapper, .ehsyv870')) score += 50;
  if (el.closest && el.closest('.e5x5d221')) score += 20;
  if (el.classList && (el.classList.contains('ehsyv870') || el.classList.contains('textarea-wrapper'))) score += 20;
  if (isNearOfficialSend(el)) score += 30;
  if (el.closest && el.closest('#tab-boxes, .gift-menu-header, .icon-list')) score -= 80;
  if (isMxVisibleField(el)) score += 25;
  else score -= 10;
  return score;
}

/**
 * 公式のコメント欄(会場の入力は飛ばす・ダミー欄も飛ばす)。
 * @param {ParentNode} [root]
 * @returns {HTMLTextAreaElement | HTMLInputElement | HTMLElement | null}
 */
export function findMxCommentInput(root = typeof document !== 'undefined' ? document : /** @type {any} */ (null)) {
  if (!root || typeof root.querySelectorAll !== 'function') return null;
  /** @type {Element[]} */
  const all = [];
  for (const scope of collectSearchRoots(root)) {
    all.push(...queryFieldsIn(scope));
    try {
      for (const box of Array.from(scope.querySelectorAll(MX_COMPOSER_SEL))) {
        if (isOwnExtensionUi(box) || isMxCommentPromptOnly(box)) continue;
        all.push(...queryFieldsIn(box));
        // 見た目の「コメントする...」が兄弟の文言で、入力本体に placeholder が無いとき
        if (PLACEHOLDER_RE.test(String(box.textContent || '')) && !isMxCommentPromptOnly(box)) {
          all.push(...queryFieldsIn(box));
        }
      }
    } catch {
      /* no-op */
    }
  }
  const unique = [];
  const seen = new Set();
  for (const el of all) {
    if (!el || seen.has(el) || !isTypeableField(el)) continue;
    seen.add(el);
    unique.push(el);
  }
  const official = unique.filter(isLikelyOfficialField);
  official.sort((a, b) => scoreField(b) - scoreField(a));
  return official.length ? /** @type {any} */ (official[0]) : null;
}

/**
 * 欄がまだ出ていないとき、公式の枠を1回だけ押して欄を出してよいか(ログイン案内は押さない)。
 * @param {ParentNode} [root]
 * @returns {HTMLElement | null}
 */
export function findMxCommentComposerToReveal(root = typeof document !== 'undefined' ? document : /** @type {any} */ (null)) {
  if (!root || typeof root.querySelectorAll !== 'function') return null;
  for (const scope of collectSearchRoots(root)) {
    try {
      const boxes = [
        ...Array.from(scope.querySelectorAll(MX_COMPOSER_SEL)),
        ...Array.from(scope.querySelectorAll('button, [role="button"], .column.right, .column.right *, [class*="textarea"]')).filter((el) => {
          const t = String(el.textContent || '').replace(/\s+/g, ' ').trim();
          return t.length <= 20 && /コメントする/.test(t) && !LOGIN_PROMPT_RE.test(t);
        }),
      ];
      for (const box of boxes) {
        const el = /** @type {HTMLElement} */ (box);
        if (isOwnExtensionUi(el) || isMxCommentPromptOnly(el)) continue;
        if (el.querySelector && el.querySelector('textarea, input, [contenteditable="true"], [role="textbox"]')) continue;
        if (LOGIN_PROMPT_RE.test(String(el.textContent || ''))) continue;
        if (typeof el.click === 'function') return el;
      }
    } catch {
      /* no-op */
    }
  }
  return null;
}

/**
 * 公式の送信ボタン(会場の「送信」・ギフトの「送信する」は拾わない)。入力の近くを先に。
 * @param {ParentNode} [root]
 * @param {Element | null} [near]
 * @returns {HTMLButtonElement | null}
 */
export function findMxSendButton(root = typeof document !== 'undefined' ? document : /** @type {any} */ (null), near = null) {
  if (!root) return null;
  /** @param {Element | null | undefined} b */
  const isGiftSend = (b) => {
    if (!b) return true;
    if (isOwnExtensionUi(b)) return true;
    const label = `${b.textContent || ''} ${b.getAttribute('aria-label') || ''}`.replace(/\s+/g, ' ').trim();
    if (GIFT_SEND_RE.test(label)) return true;
    if (b.closest && b.closest('#tab-boxes, .gift-menu-header, .icon-list')) return true;
    return false;
  };
  let el = near;
  for (let i = 0; el && i < 10; i += 1) {
    if (typeof el.querySelector === 'function') {
      const byClass = el.querySelector('button.submit-btn');
      if (byClass && !isGiftSend(byClass)) return /** @type {HTMLButtonElement} */ (byClass);
    }
    el = el.parentElement;
  }
  for (const scope of collectSearchRoots(root)) {
    try {
      for (const b of Array.from(scope.querySelectorAll('button.submit-btn'))) {
        if (!isGiftSend(b)) return /** @type {HTMLButtonElement} */ (b);
      }
    } catch {
      /* no-op */
    }
  }
  const picked = findPageButton(root, COMMENT_SEND_RE, near);
  if (picked && !isGiftSend(picked)) return picked;
  return null;
}

/**
 * 送れなかったときの記録用(本文や入力値は入れない)。
 * @param {ParentNode} [root]
 * @returns {{ textareas: number, inputs: number, composers: number, placeholders: string[] }}
 */
export function describeMxCommentInputLookup(root = typeof document !== 'undefined' ? document : /** @type {any} */ (null)) {
  const empty = { textareas: 0, inputs: 0, composers: 0, placeholders: /** @type {string[]} */ ([]) };
  if (!root || typeof root.querySelectorAll !== 'function') return empty;
  /** @type {string[]} */
  const placeholders = [];
  let textareas = 0;
  let inputs = 0;
  let composers = 0;
  try {
    for (const scope of collectSearchRoots(root)) {
      textareas += scope.querySelectorAll('textarea').length;
      inputs += scope.querySelectorAll('input').length;
      composers += scope.querySelectorAll(MX_COMPOSER_SEL).length;
      for (const el of Array.from(scope.querySelectorAll('[placeholder], textarea, [role="textbox"]'))) {
        const ph = String(/** @type {Element} */ (el).getAttribute('placeholder') || '').trim();
        if (ph && placeholders.length < 8) placeholders.push(ph.slice(0, 40));
      }
    }
  } catch {
    /* 計器 */
  }
  return { textareas, inputs, composers, placeholders };
}

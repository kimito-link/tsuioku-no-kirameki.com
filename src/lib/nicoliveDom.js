// @ts-nocheck — React fiber 探索など DOM 内部構造に依存
/**
 * ニコ生 watch ページのコメント一覧からの抽出（セレクタは実機で要調整）
 */

/** 行頭: コメント番号 + 空白 + 本文（table-row 側と桁を揃え長時間配信でも落とさない） */
const LINE_HEAD = /^(\d{1,12})\s+([\s\S]+)$/;

/**
 * プレーンテキスト1行から { commentNo, text } を試す
 * @param {string} text
 * @returns {{ commentNo: string, text: string } | null}
 */
export function parseCommentLineText(text) {
  const t = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!t) return null;
  const m = t.match(LINE_HEAD);
  if (!m) return null;
  const body = m[2].replace(/\n+/g, ' ').trim();
  if (!body) return null;
  return { commentNo: m[1], text: body };
}

/**
 * a[href*="/user/数字"] などからニコニコのユーザーIDを推定
 * @param {Element} el
 * @returns {string|null}
 */
export function extractUserIdFromLinks(el) {
  if (!el || el.nodeType !== 1) return null;
  /** @param {string | null | undefined} href */
  const tryHref = (href) => {
    const h = String(href || '');
    const m =
      h.match(/nicovideo\.jp\/user\/(\d+)/i) ||
      h.match(/live\.nicovideo\.jp\/watch\/user\/(\d+)/i) ||
      h.match(/\/user\/(\d+)/i);
    return m ? m[1] : null;
  };

  const anchors = el.querySelectorAll('a[href]');
  for (const a of anchors) {
    const id = tryHref(a.getAttribute('href'));
    if (id) return id;
  }

  let p = el;
  for (let i = 0; i < 10 && p; i++) {
    if (p.tagName === 'A') {
      const id = tryHref(p.getAttribute('href'));
      if (id) return id;
    }
    p = p.parentElement;
  }

  return null;
}

/**
 * 行内の data-* に user / author / owner が含まれる属性からIDらしき値を拾う
 * @param {Element} el
 * @returns {string|null}
 */
export function extractUserIdFromDataAttributes(el) {
  if (!el || el.nodeType !== 1) return null;
  const nodes = [el, ...el.querySelectorAll('*')];
  for (const n of nodes) {
    const attrs = n.attributes;
    if (!attrs) continue;
    for (let i = 0; i < attrs.length; i++) {
      const name = attrs[i].name.toLowerCase();
      if (
        !name.includes('user') &&
        !name.includes('owner') &&
        !name.includes('author') &&
        !name.includes('account')
      ) {
        continue;
      }
      const v = String(attrs[i].value || '').trim();
      if (/^\d{5,14}$/.test(v)) return v;
      if (/^[a-zA-Z0-9_-]{10,26}$/.test(v)) return v;
    }
  }
  return null;
}

/**
 * img の遅延読み込み用属性名（`collectNicoUserIconUrlPartsFromImg` と content script の MutationObserver.attributeFilter と同期）
 */
export const NICO_USER_ICON_IMG_LAZY_ATTRS = Object.freeze([
  'src',
  'data-src',
  'data-lazy-src',
  'data-original',
  'data-url'
]);

/**
 * img の src / srcset / data-* から URL 断片を集める（遅延読み込み対応）
 * @param {HTMLImageElement} img
 * @returns {string[]}
 */
export function collectNicoUserIconUrlPartsFromImg(img) {
  if (!(img instanceof HTMLImageElement)) return [];
  const urls = [];
  for (const a of NICO_USER_ICON_IMG_LAZY_ATTRS) {
    const v = img.getAttribute(a);
    if (v) urls.push(String(v).trim());
  }
  const srcset = img.getAttribute('srcset');
  if (srcset) {
    for (const chunk of srcset.split(',')) {
      const token = chunk.trim().split(/\s+/)[0];
      if (token) urls.push(token);
    }
  }
  return urls;
}

/**
 * @param {string} url
 */
export function looksLikeNicoUserIconUrl(url) {
  const s = String(url || '');
  if (!s) return false;
  return /nicoaccount\/usericon|\/usericon\/|usericon\.nicovideo|\/usericon\/defaults\//i.test(
    s
  );
}

/** @param {string} raw @param {string} base */
function toAbsoluteHttpUrl(raw, base) {
  const r = String(raw || '').trim();
  if (!r) return '';
  let abs = '';
  try {
    abs = new URL(r, base).href;
  } catch {
    abs = r;
  }
  return /^https?:\/\//i.test(abs) ? abs : '';
}

/** @param {string} abs */
function avatarUrlHeuristicScore(abs) {
  const u = String(abs || '');
  if (!u) return -999;
  let score = 0;
  if (looksLikeNicoUserIconUrl(u)) score += 120;
  if (/(avatar|icon|profile|user|face|user[_-]?image)/i.test(u)) score += 36;
  if (/(emoji|stamp|gift|logo|banner|sprite|program|thumbnail|player)/i.test(u))
    score -= 90;
  if (/(nimg\.jp|nicovideo\.jp|dcdn|cdn)/i.test(u)) score += 10;
  return score;
}

/** @param {HTMLImageElement} img */
function imageSizePenaltyOrBonus(img) {
  const rect = img.getBoundingClientRect();
  const wAttr = Number(img.getAttribute('width') || 0);
  const hAttr = Number(img.getAttribute('height') || 0);
  const w = Number(rect.width || 0) || wAttr || Number(img.naturalWidth || 0) || 0;
  const h = Number(rect.height || 0) || hAttr || Number(img.naturalHeight || 0) || 0;
  if ((w > 0 && w > 96) || (h > 0 && h > 96)) return -999;
  if ((w > 0 && w < 10) || (h > 0 && h < 10)) return -40;
  if ((w > 0 && w <= 64) || (h > 0 && h <= 64)) return 16;
  if ((w > 0 && w <= 96) || (h > 0 && h <= 96)) return 8;
  return 0;
}

/** @param {Element} el */
function avatarElementHintScore(el) {
  const className = String(el.getAttribute?.('class') || '');
  const id = String(el.getAttribute?.('id') || '');
  const alt = String(el.getAttribute?.('alt') || '');
  const aria = String(el.getAttribute?.('aria-label') || '');
  const dataTest = String(el.getAttribute?.('data-testid') || '');
  const all = `${className} ${id} ${alt} ${aria} ${dataTest}`;
  if (/(avatar|icon|user|profile|face)/i.test(all)) return 24;
  return 0;
}

/**
 * @param {string} raw
 * @returns {string|null}
 */
function extractUserIdFromNicoUserIconUrlString(raw) {
  const s = String(raw || '');
  let m = s.match(/\/usericon\/(?:s\/)?(\d+)\/(\d+)\./i);
  if (m?.[2]) return m[2];
  m = s.match(/nicoaccount\/usericon\/(\d+)/i);
  if (m?.[1] && m[1].length >= 5) return m[1];
  return null;
}

/**
 * アイコン URL 等からユーザー数字IDを推定（例: usericon/8625/86255751）。
 * `extractUserIconUrlFromElement` と同様に data-src / srcset を見る（遅延読み込み）。
 * @param {Element} el
 * @returns {string|null}
 */
export function extractUserIdFromIconSrc(el) {
  if (!el || el.nodeType !== 1) return null;
  const imgs = el.querySelectorAll('img');
  for (const img of imgs) {
    if (!(img instanceof HTMLImageElement)) continue;
    for (const raw of collectNicoUserIconUrlPartsFromImg(img)) {
      if (!looksLikeNicoUserIconUrl(raw)) continue;
      const id = extractUserIdFromNicoUserIconUrlString(raw);
      if (id) return id;
    }
  }
  const av = extractUserIconUrlFromElement(el);
  if (av) return extractUserIdFromNicoUserIconUrlString(av);
  return null;
}

/**
 * 1つの img 要素からニコユーザーアイコンの絶対 URL を試す
 * @param {HTMLImageElement} img
 * @param {string} baseHref
 * @returns {string}
 */
export function absoluteNicoUserIconFromImg(img, baseHref) {
  const base = String(baseHref || '').trim() || 'https://live.nicovideo.jp/';
  if (!(img instanceof HTMLImageElement)) return '';
  for (const raw of collectNicoUserIconUrlPartsFromImg(img)) {
    if (!looksLikeNicoUserIconUrl(raw)) continue;
    let abs = '';
    try {
      abs = new URL(raw, base).href;
    } catch {
      abs = raw;
    }
    if (!/^https?:\/\//i.test(abs)) continue;
    const rect = img.getBoundingClientRect();
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      (rect.width > 96 || rect.height > 96)
    ) {
      continue;
    }
    return abs;
  }
  return '';
}

/**
 * 背景画像など CSS 値から url(...) を抜く
 * @param {string} raw
 * @returns {string[]}
 */
function urlsFromCssLikeValue(raw) {
  const s = String(raw || '');
  if (!s) return [];
  const out = [];
  const re = /url\((['"]?)(.*?)\1\)/gi;
  let m;
  while ((m = re.exec(s)) != null) {
    const u = String(m[2] || '').trim();
    if (u) out.push(u);
  }
  return out;
}

/**
 * img から「ユーザーサムネらしい」URLを推定
 * @param {HTMLImageElement} img
 * @param {string} baseHref
 * @returns {string}
 */
function absoluteLikelyAvatarFromImg(img, baseHref) {
  const base = String(baseHref || '').trim() || 'https://live.nicovideo.jp/';
  if (!(img instanceof HTMLImageElement)) return '';
  let best = '';
  let bestScore = -999;
  const sizeScore = imageSizePenaltyOrBonus(img);
  if (sizeScore <= -900) return '';
  const hintScore = avatarElementHintScore(img);
  for (const raw of collectNicoUserIconUrlPartsFromImg(img)) {
    const abs = toAbsoluteHttpUrl(raw, base);
    if (!abs) continue;
    const score = avatarUrlHeuristicScore(abs) + sizeScore + hintScore;
    if (score > bestScore) {
      bestScore = score;
      best = abs;
    }
  }
  return bestScore >= 25 ? best : '';
}

/**
 * img 以外の要素（background-image / data-*）から avatar URL を探す
 * @param {Element} el
 * @param {string} baseHref
 * @returns {string}
 */
function absoluteNicoUserIconFromElementAttrs(el, baseHref) {
  if (!el || el.nodeType !== 1) return '';
  const base = String(baseHref || '').trim() || 'https://live.nicovideo.jp/';
  const attrs = [
    'src',
    'data-src',
    'data-original',
    'data-lazy-src',
    'data-url',
    'data-avatar-url',
    'style'
  ];
  const rawCandidates = [];
  for (const a of attrs) {
    const v = el.getAttribute?.(a);
    if (!v) continue;
    rawCandidates.push(String(v).trim());
    if (a === 'style') {
      rawCandidates.push(...urlsFromCssLikeValue(v));
    }
  }

  const inlineBg = /** @type {HTMLElement} */ (el).style?.backgroundImage || '';
  if (inlineBg) rawCandidates.push(...urlsFromCssLikeValue(inlineBg));
  try {
    const win = el.ownerDocument?.defaultView;
    if (win && el instanceof win.HTMLElement) {
      const computedBg = win.getComputedStyle(el).backgroundImage;
      if (computedBg) rawCandidates.push(...urlsFromCssLikeValue(computedBg));
    }
  } catch {
    // no-op
  }

  let best = '';
  let bestScore = -999;
  const hintScore = avatarElementHintScore(el);
  for (const raw of rawCandidates) {
    const abs = toAbsoluteHttpUrl(raw, base);
    if (!abs) continue;
    let score = avatarUrlHeuristicScore(abs) + hintScore;
    const rect = /** @type {HTMLElement} */ (el).getBoundingClientRect?.();
    const w = Number(rect?.width || 0);
    const h = Number(rect?.height || 0);
    if ((w > 0 && w > 120) || (h > 0 && h > 120)) score -= 50;
    if (score > bestScore) {
      bestScore = score;
      best = abs;
    }
  }
  return bestScore >= 25 ? best : '';
}

/**
 * コメント行などからユーザーアイコン画像の絶対 URL を1つ返す
 * @param {Element} el
 * @param {string} [baseHref] new URL の基底（document.location 相当）
 * @returns {string} 無ければ空文字
 */
export function extractUserIconUrlFromElement(el, baseHref) {
  if (!el || el.nodeType !== 1) return '';
  const base = String(baseHref || '').trim() || 'https://live.nicovideo.jp/';
  const imgs = el.querySelectorAll('img');
  for (const img of imgs) {
    const abs = absoluteNicoUserIconFromImg(/** @type {HTMLImageElement} */ (img), base);
    if (abs) return abs;
  }
  for (const img of imgs) {
    const abs = absoluteLikelyAvatarFromImg(/** @type {HTMLImageElement} */ (img), base);
    if (abs) return abs;
  }
  const nodes = [el, ...el.querySelectorAll('*')];
  for (let i = 0; i < nodes.length && i < 120; i += 1) {
    if (nodes[i] instanceof HTMLImageElement) continue;
    const abs = absoluteNicoUserIconFromElementAttrs(nodes[i], base);
    if (abs) return abs;
  }
  return '';
}

/** @param {Document|null|undefined} doc */
function documentBaseHref(doc) {
  try {
    return String(doc?.defaultView?.location?.href || '').trim();
  } catch {
    return '';
  }
}

/**
 * React fiber の内部状態からユーザーIDを探索する。
 * ニコ生は React 描画のため、table-row コンポーネントの props/state に
 * userId / user_id / hashedUserId 等が含まれている場合がある。
 * @param {Element} el
 * @returns {string|null}
 */
export function extractUserIdFromReactFiber(el) {
  if (!el || el.nodeType !== 1) return null;
  const targets = [el, el.parentElement].filter(Boolean);
  for (const node of targets) {
    const fiber = getReactFiber(node);
    if (!fiber) continue;
    const id = walkFiberForUserId(fiber, 6);
    if (id) return id;
  }
  return null;
}

/**
 * コメント table-row 自身の fiber のみ見る（親リストの配信者コンテキストを拾わない）
 * @param {Element} el
 * @returns {string|null}
 */
export function extractUserIdFromReactFiberSelfOnly(el) {
  if (!el || el.nodeType !== 1) return null;
  const fiber = getReactFiber(el);
  if (!fiber) return null;
  return pickUserIdFromFiber(fiber);
}

/**
 * 行サブツリー内の要素だけを幅優先でたどり、各ノードの fiber（return 連鎖含む）から userId を探す。
 * 行ルートの fiber は配信者コンテキストになりやすいので既定ではスキップする。
 *
 * @param {Element} root
 * @param {number} [maxNodes]
 * @param {{ skipRoot?: boolean }} [opts]
 * @returns {string|null}
 */
export function extractUserIdFromReactFiberInSubtree(
  root,
  maxNodes = 56,
  opts = {}
) {
  if (!root || root.nodeType !== 1) return null;
  const skipRoot = Boolean(opts.skipRoot);
  /** @type {Element[]} */
  const queue = [];
  if (!skipRoot) queue.push(root);
  for (const c of root.children) queue.push(c);
  let seen = 0;
  while (queue.length > 0 && seen < maxNodes) {
    const el = queue.shift();
    if (!el || el.nodeType !== 1) continue;
    seen += 1;
    const id = extractUserIdFromReactFiberSelfOnly(el);
    if (id) return id;
    for (const c of el.children) queue.push(c);
  }
  return null;
}

/**
 * PC コメント一覧の1行に閉じた userId 推定（親DOM・祖先 fiber に上らない）
 * @param {Element} row
 * @returns {string|null}
 */
export function resolveUserIdForNicoLiveCommentRow(row) {
  if (!row || row.nodeType !== 1) return null;
  const fromAttr =
    row.getAttribute('data-user-id') ||
    row.getAttribute('data-userid') ||
    row.getAttribute('data-owner-id') ||
    '';
  let userId = String(fromAttr || '').trim() || null;
  if (!userId) userId = extractUserIdFromLinks(row);
  if (!userId) userId = extractUserIdFromIconSrc(row);
  if (!userId) userId = extractUserIdFromDataAttributes(row);
  if (!userId) {
    userId = extractUserIdFromReactFiberInSubtree(row, 56, { skipRoot: true });
  }
  if (!userId) userId = extractUserIdFromOuterHtml(row);
  return userId;
}

/**
 * @param {string|undefined|null} raw
 * @returns {string}
 */
function cleanNicknameCandidate(raw) {
  const t = String(raw ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || t.length > 128) return '';
  if (/^https?:\/\//i.test(t)) return '';
  return t;
}

/**
 * PC コメント table-row から表示名（intercept 不調時の DOM フォールバック）
 * @param {Element} row
 * @param {string} commentText
 * @returns {string}
 */
function extractNicknameFromNicoLiveCommentRow(row, commentText) {
  if (!row || row.nodeType !== 1) return '';
  const bodyNorm = String(commentText || '').replace(/\s+/g, ' ').trim();

  /** @param {string} n */
  const accept = (n) => {
    const s = cleanNicknameCandidate(n);
    if (!s) return '';
    if (bodyNorm && s === bodyNorm) return '';
    return s;
  };

  try {
    const links = row.querySelectorAll('a[href*="/user/"]');
    for (const a of links) {
      const t = accept(a.getAttribute('title') || '');
      if (t) return t;
      const ar = accept(a.getAttribute('aria-label') || '');
      if (ar) return ar;
    }
  } catch {
    // no-op
  }

  const dataHints = [
    row.getAttribute('data-user-name'),
    row.getAttribute('data-username'),
    row.getAttribute('data-display-name')
  ];
  for (const d of dataHints) {
    const t = accept(d || '');
    if (t) return t;
  }

  try {
    const namedChild = row.querySelector('[data-user-name]');
    if (namedChild) {
      const t = accept(namedChild.getAttribute('data-user-name') || '');
      if (t) return t;
    }
  } catch {
    // no-op
  }

  const fromFiber = extractNicknameFromReactFiberInSubtree(row, 56, {
    skipRoot: true
  });
  if (fromFiber) {
    const t = accept(fromFiber);
    if (t) return t;
  }

  return '';
}

/** @param {Element|null} el */
function getReactFiber(el) {
  if (!el) return null;
  const keys = Object.keys(el);
  for (const k of keys) {
    if (k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')) {
      return el[k] || null;
    }
  }
  return null;
}

const USERID_PROP_KEYS = [
  'userId', 'user_id', 'userid',
  'hashedUserId', 'hashed_user_id',
  'senderUserId', 'accountId', 'uid'
];

/**
 * @param {unknown} fiber
 * @param {number} maxDepth
 * @returns {string|null}
 */
function walkFiberForUserId(fiber, maxDepth) {
  let cur = fiber;
  for (let i = 0; i < maxDepth && cur; i++) {
    const id = pickUserIdFromFiber(cur);
    if (id) return id;
    cur = cur.return;
  }
  return null;
}

/** @param {Record<string, unknown>} fiber @returns {string|null} */
function pickUserIdFromFiber(fiber) {
  if (!fiber || typeof fiber !== 'object') return null;
  for (const bag of [fiber.memoizedProps, fiber.pendingProps]) {
    const id = pickUserIdFromBag(bag);
    if (id) return id;
  }
  return null;
}

/** @param {unknown} bag @returns {string|null} */
function pickUserIdFromBag(bag) {
  if (!bag || typeof bag !== 'object') return null;
  const obj = /** @type {Record<string, unknown>} */ (bag);
  for (const key of USERID_PROP_KEYS) {
    const v = obj[key];
    if (v == null) continue;
    const s = String(v).trim();
    if (/^\d{5,14}$/.test(s)) return s;
    if (/^[a-zA-Z0-9_-]{10,26}$/.test(s)) return s;
  }
  for (const key of ['comment', 'data', 'item', 'chat', 'message']) {
    const nested = obj[key];
    if (!nested || typeof nested !== 'object') continue;
    const nestedObj = /** @type {Record<string, unknown>} */ (nested);
    for (const uid of USERID_PROP_KEYS) {
      const v = nestedObj[uid];
      if (v == null) continue;
      const s = String(v).trim();
      if (/^\d{5,14}$/.test(s)) return s;
      if (/^[a-zA-Z0-9_-]{10,26}$/.test(s)) return s;
    }
  }
  return null;
}

/** @type {readonly string[]} */
const NICKNAME_PROP_KEYS = [
  'name',
  'nickname',
  'nickName',
  'userName',
  'screenName',
  'handleName',
  'displayName',
  'userNickname',
  'senderName',
  'profileName'
];

/**
 * React props 断片から表示名を推定（userId 取得と同系のネストを辿る）
 * @param {unknown} bag
 * @returns {string}
 */
function pickNicknameFromBag(bag) {
  if (!bag || typeof bag !== 'object') return '';
  const obj = /** @type {Record<string, unknown>} */ (bag);
  for (const key of NICKNAME_PROP_KEYS) {
    const v = obj[key];
    if (v == null) continue;
    const s = cleanNicknameCandidate(String(v));
    if (s) return s;
  }
  for (const key of ['comment', 'data', 'item', 'chat', 'message']) {
    const nested = obj[key];
    if (!nested || typeof nested !== 'object') continue;
    const nestedObj = /** @type {Record<string, unknown>} */ (nested);
    for (const nk of NICKNAME_PROP_KEYS) {
      const v = nestedObj[nk];
      if (v == null) continue;
      const s = cleanNicknameCandidate(String(v));
      if (s) return s;
    }
  }
  return '';
}

/**
 * @param {unknown} fiber
 * @returns {string}
 */
function pickNicknameFromFiber(fiber) {
  if (!fiber || typeof fiber !== 'object') return '';
  const f = /** @type {{ memoizedProps?: unknown, pendingProps?: unknown }} */ (
    fiber
  );
  for (const bag of [f.memoizedProps, f.pendingProps]) {
    const n = pickNicknameFromBag(bag);
    if (n) return n;
  }
  return '';
}

/**
 * @param {Element} el
 * @returns {string}
 */
function extractNicknameFromReactFiberSelfOnly(el) {
  if (!el || el.nodeType !== 1) return '';
  const fiber = getReactFiber(el);
  if (!fiber) return '';
  return pickNicknameFromFiber(fiber);
}

/**
 * 行サブツリー内の fiber から表示名を探す（DOM の a[href*="/user/"] が無い環境向け）
 *
 * @param {Element} root
 * @param {number} [maxNodes]
 * @param {{ skipRoot?: boolean }} [opts]
 * @returns {string}
 */
export function extractNicknameFromReactFiberInSubtree(
  root,
  maxNodes = 56,
  opts = {}
) {
  if (!root || root.nodeType !== 1) return '';
  const skipRoot = Boolean(opts.skipRoot);
  /** @type {Element[]} */
  const queue = [];
  if (!skipRoot) queue.push(root);
  for (const c of root.children) queue.push(c);
  let seen = 0;
  while (queue.length > 0 && seen < maxNodes) {
    const el = queue.shift();
    if (!el || el.nodeType !== 1) continue;
    seen += 1;
    const n = extractNicknameFromReactFiberSelfOnly(el);
    if (n) return n;
    for (const c of el.children) queue.push(c);
  }
  return '';
}

/**
 * サーバからのJSON断片がDOMに残っている場合の救済（誤検知に注意し最短マッチ）
 * @param {Element} el
 * @param {number} [maxLen]
 * @returns {string|null}
 */

export function extractUserIdFromOuterHtml(el, maxLen = 12000) {
  if (!el || el.nodeType !== 1) return null;
  let html = '';
  try {
    html = String(el.outerHTML || '').slice(0, maxLen);
  } catch {
    return null;
  }
  const patterns = [
    /"userId"\s*:\s*"([^"\\]+)"/,
    /"user_id"\s*:\s*"([^"\\]+)"/,
    /"userId"\s*:\s*(\d+)/,
    /data-user-id\s*=\s*"([^"]+)"/i,
    /data-userid\s*=\s*"([^"]+)"/i
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (!m?.[1]) continue;
    const v = String(m[1]).trim();
    if (/^\d{5,14}$/.test(v)) return v;
    if (/^[a-zA-Z0-9_-]{10,26}$/.test(v)) return v;
  }
  return null;
}

/**
 * @param {Element} el
 * @returns {string|null}
 */
export function resolveUserIdOnElement(el) {
  if (!el || el.nodeType !== 1) return null;
  const userAttr =
    el.getAttribute('data-user-id') ||
    el.getAttribute('data-userid') ||
    el.getAttribute('data-owner-id') ||
    el.closest('[data-user-id]')?.getAttribute('data-user-id') ||
    el.closest('[data-userid]')?.getAttribute('data-userid') ||
    null;
  let userId = userAttr ? String(userAttr).trim() || null : null;
  if (!userId) userId = extractUserIdFromLinks(el);
  if (!userId) userId = extractUserIdFromIconSrc(el);
  if (!userId) userId = extractUserIdFromDataAttributes(el);
  if (!userId) userId = extractUserIdFromReactFiber(el);
  if (!userId) userId = extractUserIdFromOuterHtml(el);
  if (!userId) {
    let p = el.parentElement;
    for (let i = 0; i < 10 && p; i++) {
      userId =
        extractUserIdFromLinks(p) ||
        extractUserIdFromIconSrc(p) ||
        extractUserIdFromDataAttributes(p) ||
        extractUserIdFromReactFiber(p) ||
        extractUserIdFromOuterHtml(p);
      if (userId) break;
      p = p.parentElement;
    }
  }
  return userId;
}

/**
 * 新ニコ生PC: div.table-row + .comment-number + .comment-text
 * data-comment-type は normal 以外（generalSystemMessage 等）も公式コメント数に含まれるため、
 * 番号・本文が取れる行は種類を問わず記録する。
 * @param {Element} el — 行要素またはその子孫
 * @returns {{ commentNo: string, text: string, userId: string|null, nickname?: string, avatarUrl?: string } | null}
 */
export function parseNicoLiveTableRow(el) {
  if (!el || el.nodeType !== 1) return null;
  const row = el.matches?.('.table-row')
    ? el
    : el.closest?.('div.table-row[role="row"]') || el.closest?.('.table-row');
  if (!row) return null;

  const numEl = row.querySelector('.comment-number');
  const textEl = row.querySelector('.comment-text');
  if (!numEl || !textEl) return null;

  const commentNo = String(numEl.textContent || '').replace(/\s+/g, '').trim();
  if (!commentNo || !/^\d{1,12}$/.test(commentNo)) return null;

  const text = String(textEl.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;

  const userId = resolveUserIdForNicoLiveCommentRow(row);
  const base =
    documentBaseHref(row.ownerDocument) || 'https://live.nicovideo.jp/';
  const avatarUrl = extractUserIconUrlFromElement(row, base);
  const nickname = extractNicknameFromNicoLiveCommentRow(row, text);
  const out = { commentNo, text, userId };
  if (nickname) out.nickname = nickname;
  if (avatarUrl) out.avatarUrl = avatarUrl;
  return out;
}

/**
 * @param {Element} el
 * @returns {{ commentNo: string, text: string, userId: string|null, nickname?: string, avatarUrl?: string } | null}
 */
export function parseCommentElement(el) {
  if (!el || el.nodeType !== 1) return null;
  const fromGrid = parseNicoLiveTableRow(el);
  if (fromGrid) return fromGrid;

  const userId = resolveUserIdOnElement(el);
  const base =
    documentBaseHref(el.ownerDocument) || 'https://live.nicovideo.jp/';
  const avatarUrl = extractUserIconUrlFromElement(el, base);

  const raw = (
    ('innerText' in el ? /** @type {HTMLElement} */ (el).innerText : '') ||
    el.textContent ||
    ''
  )
    .replace(/\u00a0/g, ' ')
    .trim();
  if (!raw) return null;

  const withAv = (/** @type {{ commentNo: string, text: string }} */ o) => ({
    ...o,
    userId,
    ...(avatarUrl ? { avatarUrl } : {})
  });

  const lines = raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const p = parseCommentLineText(line);
    if (p) return withAv(p);
  }
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  const p = parseCommentLineText(oneLine);
  if (p) return withAv(p);
  return null;
}

/**
 * MutationObserver 等: コメント番号・本文セルがある table-row を辿る。
 * @param {Element|null|undefined} el
 * @returns {Element|null}
 */
export function closestHarvestableNicoCommentRow(el) {
  if (!el || el.nodeType !== 1) return null;
  const row =
    el.closest?.('div.table-row[role="row"]') || el.closest?.('div.table-row');
  if (!row) return null;
  if (!row.querySelector?.('.comment-number') || !row.querySelector?.('.comment-text'))
    return null;
  return row;
}

const ROW_QUERY = [
  'li',
  '[role="listitem"]',
  '[class*="comment" i]',
  '[class*="Comment" i]'
].join(',');

/**
 * 要素自身＋子孫のニコ生コメント table-row（番号・本文セルがある行）
 * @param {Element} el
 * @returns {Element[]}
 */
function collectNicoLiveTableRows(el) {
  if (!el || el.nodeType !== 1) return [];
  const set = new Set();
  /** @param {Element} r */
  const maybeAdd = (r) => {
    if (!r.querySelector?.('.comment-number') || !r.querySelector?.('.comment-text'))
      return;
    set.add(r);
  };
  try {
    if (el.matches?.('div.table-row')) maybeAdd(el);
    el.querySelectorAll?.('div.table-row').forEach((r) => maybeAdd(r));
  } catch {
    // no-op
  }
  return [...set];
}

/**
 * 追加されたノード以下からコメント行候補を集める
 * @param {Node} root
 * @returns {{ commentNo: string, text: string, userId: string|null, nickname?: string, avatarUrl?: string }[]}
 */
export function extractCommentsFromNode(root) {
  if (!root || root.nodeType !== 1) return [];
  const el = /** @type {Element} */ (root);
  const seen = new Set();
  /** @type {{ commentNo: string, text: string, userId: string|null, nickname?: string, avatarUrl?: string }[]} */
  const out = [];

  /** @param {{ commentNo: string, text: string, userId: string|null, nickname?: string, avatarUrl?: string } | null} parsed */
  function push(parsed) {
    if (!parsed) return;
    const k = `${parsed.commentNo}\t${parsed.text}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(parsed);
  }

  const tableRows = collectNicoLiveTableRows(el);
  for (const row of tableRows) {
    push(parseNicoLiveTableRow(row));
  }

  const tag = el.tagName?.toLowerCase() || '';
  // table-row グリッドを持つ塊は子の結合 innerText で誤検知するため、ルートは行形式のみ試さない
  const skipRootBlobParse = tableRows.length > 0;
  // ul/ol は子 li に任せ、親の結合 innerText で二重計上しない
  if (!skipRootBlobParse && tag !== 'ul' && tag !== 'ol') {
    push(parseCommentElement(el));
  }

  const genericQuery =
    tableRows.length > 0 ? 'li,[role="listitem"]' : ROW_QUERY;

  if (genericQuery) {
    try {
      el.querySelectorAll(genericQuery).forEach((node) => {
        if (node.closest?.('.program-recommend-panel')) return;
        if (node.closest?.('article.program-card')) return;
        push(parseCommentElement(node));
      });
    } catch {
      // セレクタが古い環境で失敗しても続行
      el.querySelectorAll('li').forEach((node) => {
        if (node.closest?.('.program-recommend-panel')) return;
        if (node.closest?.('article.program-card')) return;
        push(parseCommentElement(node));
      });
    }
  }

  return out;
}

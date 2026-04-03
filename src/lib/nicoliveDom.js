/**
 * ニコ生 watch ページのコメント一覧からの抽出（セレクタは実機で要調整）
 */

/** 行頭: コメント番号 + 空白 + 本文 */
const LINE_HEAD = /^(\d{1,8})\s+([\s\S]+)$/;

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
 * アイコン URL 等からユーザー数字IDを推定（例: usericon/8625/86255751）
 * @param {Element} el
 * @returns {string|null}
 */
export function extractUserIdFromIconSrc(el) {
  if (!el || el.nodeType !== 1) return null;
  const imgs = el.querySelectorAll(
    'img[src*="usericon"], img[src*="nicoaccount"]'
  );
  for (const img of imgs) {
    const src = String(img.getAttribute('src') || '');
    let m = src.match(/\/usericon\/(?:s\/)?(\d+)\/(\d+)\./i);
    if (m?.[2]) return m[2];
    m = src.match(/nicoaccount\/usericon\/(\d+)/i);
    if (m?.[1] && m[1].length >= 5) return m[1];
  }
  return null;
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
    for (const bag of [cur.memoizedProps, cur.pendingProps]) {
      const id = pickUserIdFromBag(bag);
      if (id) return id;
    }
    cur = cur.return;
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
 * 新ニコ生PC: div.table-row[data-comment-type="normal"] + .comment-number + .comment-text
 * @param {Element} el — 行要素またはその子孫
 * @returns {{ commentNo: string, text: string, userId: string|null } | null}
 */
export function parseNicoLiveTableRow(el) {
  if (!el || el.nodeType !== 1) return null;
  const row = el.matches?.('.table-row')
    ? el
    : el.closest?.('div.table-row[role="row"]') || el.closest?.('.table-row');
  if (!row) return null;
  if (row.getAttribute('data-comment-type') !== 'normal') return null;

  const numEl = row.querySelector('.comment-number');
  const textEl = row.querySelector('.comment-text');
  if (!numEl || !textEl) return null;

  const commentNo = String(numEl.textContent || '').replace(/\s+/g, '').trim();
  if (!commentNo || !/^\d{1,9}$/.test(commentNo)) return null;

  const text = String(textEl.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;

  const userId = resolveUserIdOnElement(row);
  return { commentNo, text, userId };
}

/**
 * @param {Element} el
 * @returns {{ commentNo: string, text: string, userId: string|null } | null}
 */
export function parseCommentElement(el) {
  if (!el || el.nodeType !== 1) return null;
  const fromGrid = parseNicoLiveTableRow(el);
  if (fromGrid) return fromGrid;

  const userId = resolveUserIdOnElement(el);

  const raw = (
    ('innerText' in el ? /** @type {HTMLElement} */ (el).innerText : '') ||
    el.textContent ||
    ''
  )
    .replace(/\u00a0/g, ' ')
    .trim();
  if (!raw) return null;

  const lines = raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const p = parseCommentLineText(line);
    if (p) return { ...p, userId };
  }
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  const p = parseCommentLineText(oneLine);
  if (p) return { ...p, userId };
  return null;
}

const ROW_QUERY = [
  'li',
  '[role="listitem"]',
  '[class*="comment" i]',
  '[class*="Comment" i]'
].join(',');

/**
 * 要素自身＋子孫のニコ生コメント table-row（通常コメントのみ）
 * @param {Element} el
 * @returns {Element[]}
 */
function collectNicoLiveTableRows(el) {
  if (!el || el.nodeType !== 1) return [];
  const set = new Set();
  try {
    if (el.matches?.('div.table-row[data-comment-type="normal"]')) set.add(el);
    el.querySelectorAll?.('div.table-row[data-comment-type="normal"]').forEach((r) =>
      set.add(r)
    );
  } catch {
    // no-op
  }
  return [...set];
}

/**
 * 追加されたノード以下からコメント行候補を集める
 * @param {Node} root
 * @returns {{ commentNo: string, text: string, userId: string|null }[]}
 */
export function extractCommentsFromNode(root) {
  if (!root || root.nodeType !== 1) return [];
  const el = /** @type {Element} */ (root);
  const seen = new Set();
  /** @type {{ commentNo: string, text: string, userId: string|null }[]} */
  const out = [];

  /** @param {{ commentNo: string, text: string, userId: string|null } | null} parsed */
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

  try {
    el.querySelectorAll(ROW_QUERY).forEach((node) => {
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

  return out;
}

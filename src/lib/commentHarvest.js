/**
 * ニコ生PC: コメント一覧が仮想スクロールのため、スクロール位置を動かしながら DOM 上の行を拾い集める
 */

/**
 * @param {Document|Element} root
 * @returns {Element|null}
 */
export function findNicoCommentPanel(root = document) {
  if (!root || root.nodeType !== 9 && root.nodeType !== 1) return null;
  /** @type {Document} */
  const doc = root.nodeType === 9 ? /** @type {Document} */ (root) : root.ownerDocument || document;
  const base = root.nodeType === 9 ? doc.documentElement : /** @type {Element} */ (root);
  try {
    return (
      doc.querySelector('.ga-ns-comment-panel') ||
      doc.querySelector('.comment-panel') ||
      base.querySelector?.('.ga-ns-comment-panel') ||
      base.querySelector?.('.comment-panel') ||
      null
    );
  } catch {
    return null;
  }
}

/**
 * @param {Element} el
 * @returns {Element|null}
 */
export function findLargestVerticalScrollHost(el) {
  if (!el || el.nodeType !== 1) return null;
  let best = null;
  let bestDelta = 0;
  const doc = el.ownerDocument || document;
  const win = doc.defaultView;
  if (!win) return null;

  /** @param {Element} node */
  const walk = (node) => {
    if (node.nodeType !== 1) return;
    const st = win.getComputedStyle(node);
    const oy = st.overflowY;
    const ox = st.overflow;
    const scrollable =
      oy === 'auto' ||
      oy === 'scroll' ||
      oy === 'overlay' ||
      ox === 'auto' ||
      ox === 'scroll';
    const delta = node.scrollHeight - node.clientHeight;
    // インライン overflow がテスト環境で computed に乗らない場合の救済
    const inlineY = String(node.getAttribute('style') || '').includes('overflow');
    if (delta > bestDelta + 8 && (scrollable || inlineY)) {
      bestDelta = delta;
      best = node;
    }
    for (const c of node.children) walk(c);
  };
  walk(el);
  return best;
}

/**
 * コメントタブ内で実際に縦スクロールしている要素
 * @param {Document} [doc]
 * @returns {Element|null}
 */
export function findCommentListScrollHost(doc = document) {
  const panel = findNicoCommentPanel(doc);
  if (!panel) return null;

  try {
    const byRole = panel.querySelector('.body[role="rowgroup"]');
    if (byRole && byRole.scrollHeight > byRole.clientHeight + 5) return byRole;
    const byClass = panel.querySelector('.body');
    if (byClass && byClass.scrollHeight > byClass.clientHeight + 5) return byClass;
  } catch {
    // fall through
  }

  return findLargestVerticalScrollHost(panel);
}

/** @param {number} ms */
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** @param {Document} doc */
function raf(doc) {
  const win = doc.defaultView;
  if (!win?.requestAnimationFrame) return Promise.resolve();
  return new Promise((r) => win.requestAnimationFrame(() => r()));
}

/**
 * 仮想リストを上→下へステップ送りし、各位置の table-row をマージして返す
 * @param {{
 *   document?: Document,
 *   extractCommentsFromNode: (el: Element) => { commentNo?: string, text: string, userId?: string|null }[],
 *   waitMs?: number,
 * }} opts
 */
export async function harvestVirtualCommentList(opts) {
  const doc = opts.document || document;
  const extract = opts.extractCommentsFromNode;
  const waitMs = opts.waitMs ?? 50;

  const panel = findNicoCommentPanel(doc);
  const scanRoot = panel || doc.body;
  if (!extract) return [];

  /**
   * @param {Map<string, { commentNo?: string, text: string, userId?: string|null }>} map
   * @param {{ commentNo?: string, text: string, userId?: string|null }[]} rows
   */
  const mergeInto = (map, rows) => {
    for (const row of rows) {
      const no = String(row.commentNo ?? '').trim();
      const text = String(row.text ?? '').trim();
      if (!text) continue;
      const k = no ? `${no}\t${text}` : text;
      map.set(k, row);
    }
  };

  const host = panel ? findCommentListScrollHost(doc) : null;
  if (!host || host.scrollHeight <= host.clientHeight + 10) {
    const m = new Map();
    mergeInto(m, extract(scanRoot));
    return [...m.values()];
  }

  const out = new Map();
  const saved = host.scrollTop;
  const max = Math.max(0, host.scrollHeight - host.clientHeight);
  const step = Math.max(64, Math.floor(host.clientHeight * 0.72));

  host.scrollTop = 0;
  await raf(doc);
  await delay(waitMs);
  mergeInto(out, extract(scanRoot));

  for (let y = 0; y <= max; y += step) {
    host.scrollTop = Math.min(y, max);
    await raf(doc);
    await delay(waitMs);
    mergeInto(out, extract(scanRoot));
  }

  host.scrollTop = max;
  await raf(doc);
  await delay(waitMs);
  mergeInto(out, extract(scanRoot));

  host.scrollTop = saved;
  await raf(doc);
  await delay(30);

  return [...out.values()];
}

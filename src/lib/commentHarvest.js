/**
 * ニコ生PC: コメント一覧が仮想スクロールのため、スクロール位置を動かしながら DOM 上の行を拾い集める
 */

import { isHttpOrHttpsUrl } from './supportGrowthTileSrc.js';

/**
 * 仮想リスト走査のステップ幅（ホストの clientHeight に対する比率）。
 * 大きいほど速いがウィンドウ同士の重なりが減り、取りこぼしが増えやすい。
 * ニコ生の仮想リストは 0.5 付近でも取りこぼすことがあるためやや密にする。
 */
export const HARVEST_SCROLL_STEP_CLIENT_HEIGHT_RATIO = 0.46;

/**
 * 同一コメント（commentNo + text）について、スクロール位置ごとの抽出結果をマージする。
 * 後続パスで仮想行が「薄く」なり userId / avatarUrl が空になることがあるため、
 * 空で上書きしない（調査メモ research-nicolive-pc-comments.md §8.1）。
 *
 * @param {{ commentNo?: string, text: string, userId?: string|null, nickname?: string, avatarUrl?: string }} prev
 * @param {{ commentNo?: string, text: string, userId?: string|null, nickname?: string, avatarUrl?: string }} next
 */
export function mergeVirtualHarvestRows(prev, next) {
  const uidN = String(next.userId ?? '').trim();
  const uidP = String(prev.userId ?? '').trim();
  const userId = uidN || uidP || null;

  const nickN = String(next.nickname ?? '').trim();
  const nickP = String(prev.nickname ?? '').trim();
  const nickname = nickN || nickP;

  const avN = String(next.avatarUrl ?? '').trim();
  const avP = String(prev.avatarUrl ?? '').trim();
  const avatarUrl =
    (isHttpOrHttpsUrl(avN) ? avN : '') || (isHttpOrHttpsUrl(avP) ? avP : '');

  const commentNo = String(next.commentNo ?? prev.commentNo ?? '').trim();
  const text = String(next.text ?? prev.text ?? '').trim();

  /** @type {{ commentNo: string, text: string, userId: string|null, nickname?: string, avatarUrl?: string }} */
  const out = { commentNo, text, userId };
  if (nickname) out.nickname = nickname;
  if (avatarUrl) out.avatarUrl = avatarUrl;
  return out;
}

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
 * watch ページでコメント入力などにフォーカスがあるとき、仮想リストのスクロール走査を避ける。
 * @param {Document} doc
 * @returns {boolean}
 */
export function pageUserLikelyTypingIn(doc) {
  const ae = doc.activeElement;
  if (!ae || ae.nodeType !== Node.ELEMENT_NODE) return false;
  const el = /** @type {Element} */ (ae);
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const t = /** @type {HTMLInputElement} */ (el).type;
    return (
      t === 'text' ||
      t === 'search' ||
      t === 'email' ||
      t === 'url' ||
      t === 'tel' ||
      t === ''
    );
  }
  return /** @type {HTMLElement} */ (el).isContentEditable === true;
}

/**
 * 仮想リストを上→下へステップ送りし、各位置の table-row をマージして返す
 * @param {{
 *   document?: Document,
 *   extractCommentsFromNode: (el: Element) => { commentNo?: string, text: string, userId?: string|null, avatarUrl?: string }[],
 *   waitMs?: number,
 *   respectTyping?: boolean,
 *   twoPass?: boolean,
 *   twoPassGapMs?: number,
 *   scrollStepClientHeightRatio?: number,
 *   onBetweenVirtualPasses?: () => void
 * }} opts
 */
export async function harvestVirtualCommentList(opts) {
  const doc = opts.document || document;
  const extract = opts.extractCommentsFromNode;
  const waitMs = opts.waitMs ?? 50;
  const respectTyping = opts.respectTyping !== false;
  const twoPass = Boolean(opts.twoPass);
  const twoPassGapMs = opts.twoPassGapMs ?? 140;
  const scrollStepRatio =
    typeof opts.scrollStepClientHeightRatio === 'number'
      ? opts.scrollStepClientHeightRatio
      : HARVEST_SCROLL_STEP_CLIENT_HEIGHT_RATIO;

  const panel = findNicoCommentPanel(doc);
  const scanRoot = panel || doc.body;
  if (!extract) return [];

  /**
   * @param {Map<string, { commentNo?: string, text: string, userId?: string|null, avatarUrl?: string }>} map
   * @param {{ commentNo?: string, text: string, userId?: string|null, avatarUrl?: string }[]} rows
   */
  const mergeInto = (map, rows) => {
    for (const row of rows) {
      const no = String(row.commentNo ?? '').trim();
      const text = String(row.text ?? '').trim();
      if (!text) continue;
      const k = no ? `${no}\t${text}` : text;
      const existing = map.get(k);
      if (!existing) {
        map.set(k, row);
        continue;
      }
      map.set(k, mergeVirtualHarvestRows(existing, row));
    }
  };

  /**
   * @param {Map<string, { commentNo?: string, text: string, userId?: string|null, avatarUrl?: string }>} map
   * @param {boolean} restoreFocusAfter
   */
  const runVirtualScrollSweep = async (map, restoreFocusAfter) => {
    const host = panel ? findCommentListScrollHost(doc) : null;
    if (!host || host.scrollHeight <= host.clientHeight + 10) {
      mergeInto(map, extract(scanRoot));
      return;
    }

    if (respectTyping && pageUserLikelyTypingIn(doc)) {
      mergeInto(map, extract(scanRoot));
      return;
    }

    const saved = host.scrollTop;
    const max = Math.max(0, host.scrollHeight - host.clientHeight);
    const step = Math.max(64, Math.floor(host.clientHeight * scrollStepRatio));

    host.scrollTop = 0;
    await raf(doc);
    await delay(waitMs);
    mergeInto(map, extract(scanRoot));

    for (let y = 0; y <= max; y += step) {
      host.scrollTop = Math.min(y, max);
      await raf(doc);
      await delay(waitMs);
      mergeInto(map, extract(scanRoot));
    }

    host.scrollTop = max;
    await raf(doc);
    await delay(waitMs);
    mergeInto(map, extract(scanRoot));

    host.scrollTop = saved;
    await raf(doc);
    await delay(30);

    if (restoreFocusAfter && focusEl && focusEl.isConnected) {
      try {
        focusEl.focus({ preventScroll: true });
      } catch {
        try {
          focusEl.focus();
        } catch {
          // no-op
        }
      }
    }
  };

  const focusEl =
    doc.activeElement instanceof HTMLElement ? doc.activeElement : null;

  const out = new Map();
  await runVirtualScrollSweep(out, !twoPass);
  if (twoPass) {
    await delay(twoPassGapMs);
    opts.onBetweenVirtualPasses?.();
    await runVirtualScrollSweep(out, true);
  }

  return [...out.values()];
}

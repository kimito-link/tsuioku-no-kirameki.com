/**
 * v0.1.237: 北極星「鏡のように貼り付け」用の自前最小サニタイザ。
 *
 * niconico DOM の outerHTML（広告ランキング / 貢献度ランキング / ギフト履歴 等）を
 * popup に流し込む際、許可タグ・許可属性のみ通すホワイトリスト方式で sanitize する。
 *
 * 設計判断（2026-05-09 会議室で確定）:
 * - DOMPurify 等の依存を入れない（プロジェクトはランタイム依存ゼロ方針）
 * - createElementNS で SVG namespace を正しく保つ（path / linearGradient 等が描画される）
 * - SVG defs の `id` を nonce 付きに rename し、`url(#id)` / `xlink:href="#id"` を同期更新
 *   （同一 popup 内で複数の mirror を並べた時の id 衝突を防ぐ）
 * - `href` は全削除（popup 内クリックで意図せぬ画面遷移が起きないように）
 * - `[hidden]` 属性付き要素は削除（niconico では非表示の要素が popup CSS で見えてしまう事故を防ぐ）
 * - `data-v-*` は削除（popup 側で CSS Modules ハッシュは無効、ノイズ）
 * - `style` / `on*` は削除（CSP 衝突 / XSS）
 *
 * 純関数。副作用なし。DOMParser / document が無い環境（service worker 等）では空文字を返す。
 */

const ALLOWED_TAGS = new Set([
  // テキスト構造
  'div', 'span', 'p', 'small', 'strong', 'h1', 'h2', 'h3', 'h4',
  // リスト・テーブル
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  // インライン
  'i', 'b', 'em',
  // ボタン（default action は popup 側で抑制）
  'button',
  // 画像
  'img',
  // SVG（rank icon、contribution unit、score icon 等）
  'svg', 'path', 'defs', 'lineargradient', 'stop', 'g', 'mask', 'use',
  'title', 'rect', 'circle', 'polygon', 'ellipse', 'line', 'polyline'
]);

const ALLOWED_ATTRS = new Set([
  // 構造・識別
  'class', 'role', 'data-icon', 'aria-label',
  // img
  'src', 'alt', 'width', 'height',
  // SVG 共通
  'viewbox', 'xmlns', 'xmlns:xlink', 'xlink:href',
  // SVG 描画
  'fill', 'fill-rule', 'fill-opacity', 'stop-color', 'stop-opacity',
  'offset', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
  'd', 'transform', 'points',
  // SVG defs id（rename 対象）
  'id'
]);

/**
 * niconico の outerHTML を popup へ流し込む前に sanitize する。
 *
 * @param {string} input
 * @returns {string} sanitize 済 HTML 文字列。入力が空 / DOMParser 不在なら空文字
 */
export function sanitizeMirrorHtml(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (typeof DOMParser === 'undefined' || typeof document === 'undefined') {
    return '';
  }

  const parser = new DOMParser();
  const srcDoc = parser.parseFromString(`<div data-root="1">${raw}</div>`, 'text/html');
  const srcRoot = srcDoc.body?.firstElementChild;
  if (!srcRoot) return '';

  const outDoc = document.implementation.createHTMLDocument('');
  const outRoot = outDoc.createElement('div');

  const mirrorNonce = buildMirrorNonce();
  /** @type {Map<string, string>} */
  const idMap = new Map();

  sanitizeChildrenInto(srcRoot, outRoot, outDoc, mirrorNonce, idMap);
  rewriteSvgReferences(outRoot, idMap);

  return outRoot.innerHTML.trim();
}

/**
 * @returns {string}
 */
function buildMirrorNonce() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * @param {Element|DocumentFragment} srcParent
 * @param {Element} dstParent
 * @param {Document} outDoc
 * @param {string} mirrorNonce
 * @param {Map<string, string>} idMap
 */
function sanitizeChildrenInto(srcParent, dstParent, outDoc, mirrorNonce, idMap) {
  for (const node of Array.from(srcParent.childNodes)) {
    if (node.nodeType === 3 /* Node.TEXT_NODE */) {
      dstParent.appendChild(outDoc.createTextNode(node.textContent || ''));
      continue;
    }
    if (node.nodeType !== 1 /* Node.ELEMENT_NODE */) continue;

    const srcEl = /** @type {Element} */ (node);
    const tagName = srcEl.tagName.toLowerCase();

    // 完全削除タグ（XSS / 副作用源）
    if (tagName === 'script' || tagName === 'iframe' ||
        tagName === 'object' || tagName === 'embed' ||
        tagName === 'style' || tagName === 'link' ||
        tagName === 'meta' || tagName === 'base') {
      continue;
    }

    // [hidden] 属性付きは削除（niconico で非表示なものを popup で出さない）
    if (srcEl.hasAttribute('hidden')) {
      continue;
    }

    if (!ALLOWED_TAGS.has(tagName)) {
      // 許可外タグ自体は飛ばすが、子は再帰的に拾う（テキスト等の救出）
      sanitizeChildrenInto(srcEl, dstParent, outDoc, mirrorNonce, idMap);
      continue;
    }

    // SVG 内の要素は SVG namespace で作る（描画のために必須）
    const isSvgContext =
      tagName === 'svg' ||
      srcEl.namespaceURI === 'http://www.w3.org/2000/svg' ||
      (srcParent instanceof Element &&
        srcParent.namespaceURI === 'http://www.w3.org/2000/svg');

    const dstEl = isSvgContext
      ? outDoc.createElementNS('http://www.w3.org/2000/svg', srcEl.tagName)
      : outDoc.createElement(srcEl.tagName.toLowerCase());

    copyAllowedAttributes(srcEl, dstEl, mirrorNonce, idMap);
    sanitizeChildrenInto(srcEl, dstEl, outDoc, mirrorNonce, idMap);
    dstParent.appendChild(dstEl);
  }
}

/**
 * @param {Element} srcEl
 * @param {Element} dstEl
 * @param {string} mirrorNonce
 * @param {Map<string, string>} idMap
 */
function copyAllowedAttributes(srcEl, dstEl, mirrorNonce, idMap) {
  for (const attr of Array.from(srcEl.attributes)) {
    const rawName = String(attr.name || '');
    if (!rawName) continue;

    const lowerName = rawName.toLowerCase();
    const value = String(attr.value || '');

    // イベントハンドラ系は問答無用で削除
    if (lowerName.startsWith('on')) continue;
    // CSP / XSS / 競合の温床
    if (lowerName === 'style') continue;
    if (lowerName === 'href') continue;
    // Vue scope id（popup 側では CSS が効かない）
    if (lowerName.startsWith('data-v-')) continue;
    // ホワイトリスト外
    if (!ALLOWED_ATTRS.has(lowerName)) continue;
    // javascript: / data: 等の悪性 URL を弾く（src/xlink:href 経路）
    if (containsDangerousProtocol(value)) continue;

    if (lowerName === 'id') {
      const renamed = `nl-mirror-${mirrorNonce}-${value}`;
      idMap.set(value, renamed);
      dstEl.setAttribute('id', renamed);
      continue;
    }

    dstEl.setAttribute(rawName, value);
  }
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function containsDangerousProtocol(value) {
  return /^\s*(javascript|data|vbscript|file):/i.test(String(value || ''));
}

/**
 * defs 内 id を rename した後で、`url(#...)` / `xlink:href="#..."` の参照を同期更新する。
 *
 * @param {Element} root
 * @param {Map<string, string>} idMap
 */
function rewriteSvgReferences(root, idMap) {
  if (!idMap.size) return;

  const all = root.querySelectorAll('*');
  for (const el of all) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name;
      const value = String(attr.value || '');
      let next = value;

      // fill="url(#xxx)" / stroke="url(#xxx)" 等
      next = next.replace(/url\(#([^)]+)\)/g, (_, id) => {
        const mapped = idMap.get(id);
        return mapped ? `url(#${mapped})` : `url(#${id})`;
      });

      // xlink:href="#xxx" / href="#xxx" （ハッシュ参照のみ）
      if (/^#.+$/.test(next)) {
        next = next.replace(/^#(.+)$/, (_, id) => {
          const mapped = idMap.get(id);
          return mapped ? `#${mapped}` : `#${id}`;
        });
      }

      if (next !== value) {
        el.setAttribute(name, next);
      }
    }
  }
}

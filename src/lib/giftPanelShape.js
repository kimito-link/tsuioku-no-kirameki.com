// giftPanelShape.js — ニコ生の公式ギフト欄(番組ギフト)の作りを、読み取りだけで記録する計器(v0.1.1871)。
//   りんく(2026-11-05)が判断カードで「会場にアイテムを並べ、確認は公式」を選択。会場に同じアイテムを並べて
//   押すと公式のアイテムを押す形にするため、ログイン中のギフト欄の部品(枠・画像・pt・タブ・確認の窓)を知る必要がある。
//   ログインしていない試験用ブラウザでは中身が出ない(「ログインする必要があります」)ので、本人の画面で記録する。
//   押さない・送らない・名前など個人の情報は取らない(アイテム名と pt と部品の名前だけ)。

const PT_RE = /^\s*[\d,]+\s*pt\s*$/i;
const TAB_WORDS = ['番組ギフト', 'マイギフト', '履歴', 'ランキング'];

/** @param {Element} el */
function shortClass(el) {
  return String(el.getAttribute('class') || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** @param {Element} el */
function dataAttrNames(el) {
  return [...el.attributes].map((a) => a.name).filter((n) => n.startsWith('data-') || n === 'role' || n === 'aria-label').slice(0, 8);
}

/** @param {Element} el @returns {Element | null} */
function clickableOf(el) {
  return el.closest('button, a, [role="button"], [tabindex]');
}

/** @param {string} s */
function safeSrc(s) {
  const v = String(s || '');
  return /^https:\/\//.test(v) ? v.slice(0, 200) : v.startsWith('data:') ? 'data:' : '';
}

/**
 * @param {Document} doc
 * @param {{ maxTiles?: number }} [opts]
 * @returns {null | { tiles: any[], tabs: any[], dialogs: any[], tileCount: number }}
 */
export function captureGiftPanelShape(doc, opts = {}) {
  const maxTiles = opts.maxTiles ?? 24;
  const root = doc.body;
  if (!root) return null;
  /** @type {Element[]} */
  const ptEls = [];
  for (const el of root.querySelectorAll('span, div, p, small, b, strong, em, li')) {
    if (el.children.length > 0) continue;
    const t = String(el.textContent || '');
    if (t.length <= 20 && PT_RE.test(t)) ptEls.push(el);
    if (ptEls.length > 200) break;
  }
  /** @type {any[]} */
  const tiles = [];
  /** @type {Set<Element>} */
  const seen = new Set();
  for (const pt of ptEls) {
    let tile = pt.parentElement;
    for (let i = 0; i < 4 && tile && !tile.querySelector('img'); i += 1) tile = tile.parentElement;
    if (!tile || seen.has(tile) || !tile.querySelector('img')) continue;
    seen.add(tile);
    const img = /** @type {HTMLImageElement | null} */ (tile.querySelector('img'));
    const click = clickableOf(tile) || clickableOf(pt);
    const nameEl = [...tile.querySelectorAll('span, div, p')].find((e) => {
      const t = String(e.textContent || '').trim();
      return e.children.length === 0 && t && !PT_RE.test(t) && t.length <= 30;
    });
    tiles.push({
      tag: tile.localName,
      cls: shortClass(tile),
      attrs: dataAttrNames(tile),
      click: click ? { tag: click.localName, cls: shortClass(click), attrs: dataAttrNames(click) } : null,
      img: img ? { src: safeSrc(img.getAttribute('src') || ''), alt: String(img.getAttribute('alt') || '').slice(0, 40) } : null,
      pt: String(pt.textContent || '').trim(),
      ptCls: shortClass(pt),
      name: nameEl ? String(nameEl.textContent || '').trim() : '',
    });
    if (tiles.length >= maxTiles) break;
  }
  const tabs = [...root.querySelectorAll('[role="tab"], button, a, li, div, span')]
    .filter((el) => el.children.length <= 1 && TAB_WORDS.includes(String(el.textContent || '').trim()))
    .slice(0, 8)
    .map((el) => ({ text: String(el.textContent || '').trim(), tag: el.localName, cls: shortClass(el), attrs: dataAttrNames(el) }));
  const dialogs = [...root.querySelectorAll('[role="dialog"], [role="alertdialog"], [class*="modal" i], [class*="dialog" i], [class*="confirm" i]')]
    .slice(0, 6)
    .map((el) => ({
      tag: el.localName,
      cls: shortClass(el),
      buttons: [...el.querySelectorAll('button, a, [role="button"]')]
        .map((b) => String(b.textContent || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 24))
        .filter(Boolean)
        .slice(0, 8),
      text: String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    }));
  if (!tiles.length && !dialogs.length && !tabs.length) return null;
  return { tiles, tabs, dialogs, tileCount: seen.size };
}

/**
 * v0.1.1872: 中身が拾えなくても「この窓で動いたか・何が見えたか」を残すための数え上げ。
 * @param {Document} doc
 */
export function frameCensus(doc) {
  const root = doc.body;
  if (!root) return { bodyText: 0, els: 0, imgs: 0, shadowHosts: 0, iframes: 0 };
  const all = root.querySelectorAll('*');
  let shadowHosts = 0;
  for (const el of all) if (/** @type {any} */ (el).shadowRoot) shadowHosts += 1;
  return {
    bodyText: String(root.textContent || '').length,
    els: all.length,
    imgs: root.querySelectorAll('img').length,
    canvases: root.querySelectorAll('canvas').length,
    shadowHosts,
    iframes: root.querySelectorAll('iframe').length,
  };
}

/**
 * v0.1.1872: 親のページにある iframe の一覧(どの窓にギフトの中身があるかを知るため)。src は https のみ・パスまで。
 * @param {Document} doc
 */
export function listFrames(doc) {
  return [...doc.querySelectorAll('iframe')].slice(0, 20).map((f) => {
    const src = String(f.getAttribute('src') || '');
    let where = '';
    try {
      const u = new URL(src, 'https://live.nicovideo.jp/');
      where = u.protocol === 'https:' ? `${u.hostname}${u.pathname}`.slice(0, 120) : u.protocol;
    } catch {
      where = src ? 'bad' : '';
    }
    const r = f.getBoundingClientRect();
    const inPanel = !!f.closest('[class*="web-view-panel"], [class*="gift" i], [class*="rich-view" i]');
    return { src: where, name: String(f.getAttribute('name') || '').slice(0, 40), w: Math.round(r.width), h: Math.round(r.height), inPanel, cls: shortClass(f.parentElement || f) };
  });
}

/**
 * 3秒ごとに読み取り、変わったときだけ保存する(v0.1.1872: 中身ゼロでも数え上げを保存)(キー nls_diag_gift_panel:<host><path>)。
 *   親のページは公式のギフト欄の箱があるときだけ読む(重くしない)。30分で止める(計器なので常駐させない)。
 * @param {Window} win
 * @param {(obj: Record<string, unknown>) => void} save
 */
export function startGiftPanelRecorder(win, save) {
  let isTop = true;
  try {
    isTop = win.self === win.top;
  } catch {
    isTop = true;
  }
  const loc = win.location;
  // v0.1.1872: about:blank / srcdoc の子の窓(親がニコ生のとき)も記録する(中身を後から書き込む窓がある)
  const blankChild = !isTop && /^about:/.test(String(loc.protocol || ''));
  if (!blankChild && !/(^|\.)nicovideo\.jp$/.test(String(loc.hostname || ''))) return;
  const key = blankChild ? `nls_diag_gift_panel:about:${String(win.name || '').slice(0, 40)}` : `nls_diag_gift_panel:${loc.hostname}${loc.pathname}`.slice(0, 120);
  let last = '';
  const started = Date.now();
  const tick = () => {
    if (Date.now() - started > 30 * 60 * 1000) {
      win.clearInterval(timer);
      return;
    }
    try {
      const doc = win.document;
      if (isTop && !doc.querySelector('[class*="web-view-panel"], [class*="gift-sidebar" i], [class*="gift-panel" i]')) return;
      // v0.1.1872: 中身が拾えなくても「動いた・何が見えた」を必ず残す(子の窓は常に、親は iframe 一覧つき)
      const shape = captureGiftPanelShape(doc) || { tiles: [], tabs: [], dialogs: [], tileCount: 0 };
      const extra = isTop ? { frames: listFrames(doc) } : {};
      const census = frameCensus(doc);
      const sig = JSON.stringify([shape, extra, census.imgs, census.shadowHosts, census.iframes]);
      if (sig === last) return;
      last = sig;
      save({ [key]: { at: Date.now(), href: String(loc.href || '').slice(0, 200), top: isTop, census, ...extra, ...shape } });
    } catch {
      // 読み取りの失敗は無視(計器)
    }
  };
  const timer = win.setInterval(tick, 3000);
}

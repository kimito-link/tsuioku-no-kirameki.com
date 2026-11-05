import { openOfficialGiftPanel, showGiftItemsTabSoon, GIFT_ITEMS_TAB_REQ_KEY } from './venueComposeBox.js';

// giftItemsMirror.js — ニコ生の公式ギフト欄(gift.nicovideo.jp/…/purchase の子の窓)のアイテムを会場に並べるための読み取りと押下(v0.1.1875)。
//   りんく(2026-11-05)の選択「会場にアイテムを並べ、確認は公式」。子の窓でアイテム(名前・pt・画像)を読み、
//   chrome.storage.local に置く → 会場が同じ並びを出す → 会場で押すと子の窓の同じアイテムを押す → 公式の確認が出る。
//   ★贈る操作そのもの(確認の「贈る」)は押さない。押すのはアイテム1つだけで、最後の判断は必ず公式の画面で本人がする。

const PT_RE = /^\s*[\d,]+\s*pt\s*$/i;
const NUM_RE = /^\s*[\d,]+\s*$/;
/** アイテムではない pt(自分の所持ポイント欄・放送画面の「あと ◯pt」) */
const NOT_ITEM_SEL = '[class*="point-charge"], [class*="remaining-points"], [class*="program-gift-information"], [class*="point-balance"]';
/** 名前に使わない行(図鑑の数・案内リンク) */
const NOT_NAME_RE = /ギフト図鑑|チェック|こちら|キャンペーン|^\d|pt$/i;

/** @param {Element} el */
function leafText(el) {
  return String(el.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * pt の部品を文字の節から探す(v0.1.1875: 「500<small>pt</small>」や数字と pt が別の節でも拾う)。返すのは数字を含む要素。
 * @param {Element} root @returns {Element[]}
 */
export function priceLeaves(root) {
  /** @type {Element[]} */
  const out = [];
  const doc = root.ownerDocument;
  if (!doc) return out;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  /** @type {Text[]} */
  const texts = [];
  for (let n = walker.nextNode(); n && texts.length < 20000; n = walker.nextNode()) {
    if (String(n.nodeValue || '').trim()) texts.push(/** @type {Text} */ (n));
  }
  for (let i = 0; i < texts.length && out.length < 200; i += 1) {
    const t = String(texts[i].nodeValue || '').trim();
    const next = String(texts[i + 1]?.nodeValue || '').trim();
    const ok = PT_RE.test(t) || (NUM_RE.test(t) && /^pt$/i.test(next));
    if (!ok) continue;
    const el = texts[i].parentElement;
    if (!el || el.closest(NOT_ITEM_SEL)) continue;
    if (el.closest('section')?.querySelector('[class*="point-charge"]')) continue;
    if (el.closest('script, style')) continue;
    // 「あと 670pt で福引券」などの案内はアイテムではない
    if (/あと|獲得|景品|福引|まで/.test(String(el.parentElement?.textContent || '').slice(0, 80))) continue;
    out.push(el);
  }
  return out;
}

/** @param {Element} el @returns {string} */
function imageOf(el) {
  const img = el.querySelector('img');
  const src = String(img?.getAttribute('src') || '');
  if (/^https:\/\//.test(src)) return src.slice(0, 300);
  for (const e of [el, ...el.querySelectorAll('*')].slice(0, 60)) {
    const bg = e instanceof HTMLElement ? String(e.style.backgroundImage || '') : '';
    const m = /url\(["']?(https:\/\/[^"')]+)/.exec(bg);
    if (m) return m[1].slice(0, 300);
  }
  return '';
}

/**
 * 子の窓のアイテムを読む。1つの枠 = pt の部品から上へたどり、pt を1つだけ含む一番外側の祖先(最大8段)。
 * @param {Document} doc
 * @param {{ max?: number }} [opts]
 * @returns {{ key: string, name: string, pt: string, img: string, el: Element }[]}
 */
export function readGiftItems(doc, opts = {}) {
  const root = doc.body;
  if (!root) return [];
  const leaves = priceLeaves(root);
  const leafSet = new Set(leaves);
  /** @param {Element} a */
  const priceCount = (a) => {
    let n = 0;
    for (const l of leafSet) if (a.contains(l)) n += 1;
    return n;
  };
  /** @type {{ key: string, name: string, pt: string, img: string, el: Element }[]} */
  const out = [];
  const seenKeys = new Set();
  for (const leaf of leaves) {
    let tile = /** @type {Element} */ (leaf);
    for (let i = 0; i < 8; i += 1) {
      const up = tile.parentElement;
      if (!up || up === root || priceCount(up) > 1) break;
      tile = up;
    }
    const ptText = PT_RE.test(String(leaf.textContent || '')) ? leafText(leaf) : leafText(/** @type {Element} */ (leaf.parentElement));
    const nameEl = [...tile.querySelectorAll('span, div, p, h1, h2, h3, h4, strong, b')].find((e) => {
      if (e.children.length > 0) return false;
      const t = leafText(e);
      return !!t && t.length <= 30 && !NOT_NAME_RE.test(t) && !PT_RE.test(t);
    });
    const imgEl = tile.querySelector('img');
    const name = (nameEl ? leafText(nameEl) : String(imgEl?.getAttribute('alt') || imgEl?.getAttribute('title') || tile.getAttribute('aria-label') || '').trim()).slice(0, 30);
    const pt = ptText.replace(/\s+/g, ' ').replace(/^.*?([\d,]+\s*pt).*$/i, '$1');
    const img = imageOf(tile);
    const key = `${name || img.slice(-60)}|${pt}`;
    if ((!name && !img) || seenKeys.has(key)) continue;
    seenKeys.add(key);
    out.push({ key, name, pt, img, el: tile });
    if (out.length >= (opts.max ?? 40)) break;
  }
  return out;
}

/**
 * 会場から押されたアイテムを子の窓で押す(アイテムを選ぶだけ。贈るの確認は公式の画面で本人が押す)。
 * @param {Document} doc
 * @param {string} key  readGiftItems の key(名前|pt)
 * @returns {boolean}
 */
export function pressGiftItem(doc, key) {
  const hit = readGiftItems(doc, { max: 400 }).find((it) => it.key === key); // v0.1.1881: 帯は安い順で欄の奥の方のアイテムが多い(既定の40件で切ると見つからなかった)
  if (!hit) return false;
  const target =
    /** @type {HTMLElement | null} */ (hit.el.querySelector('img')?.closest('button, a, [role="button"], [tabindex]')) ||
    /** @type {HTMLElement | null} */ (hit.el.closest('button, a, [role="button"], [tabindex]')) ||
    /** @type {HTMLElement | null} */ (hit.el.querySelector('button, [role="button"]')) ||
    /** @type {HTMLElement} */ (hit.el);
  if (/贈る|購入|送る/.test(leafText(target)) && !/pt/.test(leafText(target))) return false; // 確認の「贈る」を誤って押さない
  try { target.scrollIntoView({ block: 'center' }); } catch { /* 送れなくても押す */ }
  target.click();
  return true;
}

export const GIFT_ITEMS_KEY = 'nls_gift_items_v1';
export const GIFT_ITEM_PRESS_REQ_KEY = 'nls_gift_item_press_req';
/** v0.1.1878 計器: 押したあと3秒で何が出たか(確認の窓が出たか)。押したもの・出てきた部品の class と文字の頭だけ */
export const GIFT_ITEM_PRESS_RESULT_KEY = 'nls_gift_item_press_result';
/** v0.1.1879: 設定「会場から1回で贈る」(既定オフ・りんく 2026-11-05 の選択)。オンの人だけ、帯を1回押すと公式の確認の「贈る」まで押す */
export const GIFT_ONE_TAP_KEY = 'nls_venue_gift_one_tap_v1';

const CONFIRM_RE = /^(ギフトを)?贈る$|^贈る[(（]?[\d,]+\s*pt[)）]?$|^[\d,]+\s*ptで?贈る$/;
const NOT_CONFIRM_RE = /購入|チャージ|買う|キャンセル|やめる|閉じる/;

/**
 * 公式の確認の「贈る」ボタンを探す(見えていて押せるものだけ)。exclude は押す前から見えていたもの(新しく出たものだけを押す)。
 * @param {Document} doc
 * @param {Set<Element>} [exclude]
 * @returns {HTMLElement | null}
 */
export function findGiftConfirmButton(doc, exclude) {
  for (const el of doc.querySelectorAll('button, [role="button"]')) {
    if (exclude?.has(el)) continue;
    const t = String(el.textContent || '').replace(/\s+/g, '');
    if (!t || t.length > 20 || NOT_CONFIRM_RE.test(t) || !CONFIRM_RE.test(t)) continue;
    if (/** @type {any} */ (el).disabled || el.getAttribute('aria-disabled') === 'true') continue;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) continue;
    return /** @type {HTMLElement} */ (el);
  }
  return null;
}

/** @param {Document} doc */
function visibleConfirmButtons(doc) {
  /** @type {Set<Element>} */
  const seen = new Set();
  for (let el = findGiftConfirmButton(doc, seen); el; el = findGiftConfirmButton(doc, seen)) seen.add(el);
  return seen;
}

/**
 * 計器用: アイテムの枠のあたりの骨組み(タグ・class・data-* の名前だけ。文字は取らない)。
 * @param {Document} doc
 * @returns {{ chain: string, outline: string } | null}
 */
export function giftItemSkeleton(doc) {
  const root = doc.body;
  if (!root) return null;
  const first = priceLeaves(root)[0];
  if (!first) return null;
  /** @param {Element} e */
  const sig = (e) => {
    const cls = String(e.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    const data = [...e.attributes].map((a) => a.name).filter((n) => n.startsWith('data-') && !n.startsWith('data-v-')).slice(0, 3);
    const bg = e instanceof HTMLElement && /url\(/.test(e.style.backgroundImage || '') ? '[bg]' : '';
    return `${e.localName}${cls ? '.' + cls : ''}${data.length ? '[' + data.join(',') + ']' : ''}${bg}`;
  };
  /** @type {string[]} */
  const chain = [];
  let a = /** @type {Element | null} */ (first);
  let base = first;
  for (let i = 0; i < 8 && a && a !== root; i += 1, a = a.parentElement) {
    chain.push(`${sig(a)}(${a.children.length})`);
    if (i === 4) base = a;
  }
  let outline = '';
  /** @param {Element} e @param {number} d */
  const walk = (e, d) => {
    if (outline.length > 4000 || d > 6) return;
    outline += `${'  '.repeat(d)}${sig(e)}\n`;
    for (const c of [...e.children].slice(0, 6)) walk(c, d + 1);
  };
  walk(base, 0);
  return { chain: chain.join(' < ').slice(0, 1200), outline: outline.slice(0, 4000) };
}

/** 会場に出す上限(pt)。これより高いアイテムは会場に出さない(公式の欄では選べる)。 */
export const VENUE_GIFT_MAX_PT = 1000;
/** 配信者へのギフトではないもの(会員権の購入など)は会場に出さない */
const NOT_VENUE_GIFT_RE = /会員権|プレミアム会員/;

/** @param {string} pt @returns {number} */
export function ptValue(pt) {
  const n = Number(String(pt || '').replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * v0.1.1877: 会場に出すアイテムを選ぶ。安い順・上限 1,000pt・会員権を除く・24個まで。
 *   公式の並びのまま出すと先頭に 1,400〜100,000pt(会員権・召喚獣)が来ていた(RC 実測 2026-11-05)。
 *   1回押せば贈れそうに見える帯の先頭に高額品を置かない。
 * @template {{ name: string, pt: string }} T
 * @param {T[]} items
 * @param {{ maxPt?: number, max?: number }} [opts]
 * @returns {T[]}
 */
export function pickVenueGiftItems(items, opts = {}) {
  const maxPt = opts.maxPt ?? VENUE_GIFT_MAX_PT;
  return items
    .map((it, i) => ({ it, i, v: ptValue(it.pt) }))
    .filter(({ it, v }) => v > 0 && v <= maxPt && !NOT_VENUE_GIFT_RE.test(it.name))
    .sort((a, b) => a.v - b.v || a.i - b.i)
    .slice(0, opts.max ?? 24)
    .map(({ it }) => it);
}

/** @param {string} path */
function lvOf(path) {
  return (/(lv\d+)/.exec(String(path || '')) || [])[1] || '';
}

/**
 * @typedef {{ get: (k: string) => Promise<Record<string, any>>, set: (o: Record<string, any>) => Promise<any> | void, onChanged: (cb: (changes: Record<string, { newValue?: any }>) => void) => void }} GiftStore
 */

/**
 * ギフトの子の窓(gift.nicovideo.jp/…/purchase)で: アイテムの並びを2秒ごとに読んで置く+会場からの押下の合図を受けて押す。
 *   開いた直後に合図が先に来ていることがある(窓が後から作られる)ので、起動時にも合図を読む。合図は10秒以内だけ有効。
 * @param {Window} win
 * @param {GiftStore} store
 */
export function startGiftItemsPublisher(win, store) {
  let top = true;
  try { top = win.self === win.top; } catch { top = false; }
  if (top || !/(^|\.)gift\.nicovideo\.jp$/.test(String(win.location.hostname || '')) || !/\/purchase/.test(String(win.location.pathname || ''))) return;
  const doc = win.document;
  const lv = lvOf(win.location.pathname);
  let last = '';
  let handled = 0;
  const started = Date.now();
  const publish = () => {
    if (Date.now() - started > 30 * 60 * 1000) return win.clearInterval(timer);
    try {
      const items = pickVenueGiftItems(readGiftItems(doc, { max: 200 }).map(({ key, name, pt, img }) => ({ key, name, pt, img })));
      const sig = JSON.stringify(items);
      if (!items.length || sig === last) return;
      last = sig;
      void store.set({ [GIFT_ITEMS_KEY]: { at: Date.now(), lv, items } });
    } catch { /* 読めなくても窓は壊さない */ }
  };
  /** @param {any} req */
  const press = (req) => {
    const at = Number(req?.at || 0);
    if (!at || at === handled || Date.now() - at > 10000 || typeof req.key !== 'string') return;
    handled = at;
    let left = 16;
    const step = () => {
      left -= 1;
      let ok = false;
      /** @type {Element[]} */
      const added = [];
      const mo = typeof MutationObserver === 'function' ? new MutationObserver((recs) => { for (const r of recs) for (const n of r.addedNodes) if (n instanceof Element && added.length < 200) added.push(n); }) : null;
      try { mo?.observe(doc.body, { childList: true, subtree: true }); } catch { /* 見張れなくても押す */ }
      const before = req.direct === true ? visibleConfirmButtons(doc) : new Set();
      try { ok = pressGiftItem(doc, req.key); } catch { ok = false; }
      if (!ok) mo?.disconnect();
      if (!ok && left > 0) win.setTimeout(step, 300);
      if (!ok && left <= 0) void store.set({ [GIFT_ITEM_PRESS_RESULT_KEY]: { at: Date.now(), reqAt: at, key: req.key, direct: req.direct === true, found: false, confirmed: false } }); // 見つからなかったことも残す(会場に「見つかりません」と出す)
      if (ok) {
        /** @type {{ confirmed: boolean, confirmText: string }} */
        const conf = { confirmed: false, confirmText: '' };
        if (req.direct === true) {
          // v0.1.1879: 1回で贈る(設定でオンの人だけ)。アイテムを押したあと新しく出た確認の「贈る」を1回だけ押す
          let tries = 12;
          const look = () => {
            tries -= 1;
            let btn = null;
            try { btn = findGiftConfirmButton(doc, before); } catch { btn = null; }
            if (btn) {
              conf.confirmed = true;
              conf.confirmText = String(btn.textContent || '').replace(/\s+/g, '').slice(0, 20);
              btn.click();
              return;
            }
            if (tries > 0) win.setTimeout(look, 200);
          };
          win.setTimeout(look, 150);
        }
        win.setTimeout(() => {
          mo?.disconnect();
          const shown = added.filter((el) => el.isConnected && (() => { const r = el.getBoundingClientRect(); return r.width >= 100 && r.height >= 40; })());
          void store.set({
            [GIFT_ITEM_PRESS_RESULT_KEY]: {
              at: Date.now(), reqAt: at, key: req.key, direct: req.direct === true, found: true, ...conf,
              shown: shown.slice(0, 6).map((el) => ({ tag: el.localName, cls: String(el.getAttribute('class') || '').slice(0, 80), role: el.getAttribute('role') || '', text: String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) })),
              head: String(doc.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160)
            }
          });
        }, 3000);
      }
    };
    win.setTimeout(step, 400); // 番組ギフトのタブへ切り替わって並びが描かれるのを待つ
  };
  /** @param {any} req */
  const tab = (req) => {
    const at = Number(req?.at || 0);
    if (at && Date.now() - at < 10000) showGiftItemsTabSoon(doc, { rootSel: 'body' });
  };
  const timer = win.setInterval(publish, 2000);
  win.setTimeout(publish, 600);
  store.onChanged((changes) => {
    if (changes?.[GIFT_ITEM_PRESS_REQ_KEY]) press(changes[GIFT_ITEM_PRESS_REQ_KEY].newValue);
  });
  void Promise.resolve(store.get(GIFT_ITEMS_TAB_REQ_KEY)).then((r) => tab(r?.[GIFT_ITEMS_TAB_REQ_KEY])).catch(() => {});
  void Promise.resolve(store.get(GIFT_ITEM_PRESS_REQ_KEY)).then((r) => press(r?.[GIFT_ITEM_PRESS_REQ_KEY])).catch(() => {});
}

/**
 * 放送ページ(親)で: 会場に出すアイテムの並びを受け取る(この放送の分だけ)。
 * @param {GiftStore} store
 * @param {string} pathname
 * @param {(items: { key: string, name: string, pt: string, img: string }[]) => void} cb
 */
export function subscribeGiftItems(store, pathname, cb) {
  const lv = lvOf(pathname);
  /** @param {any} v */
  const take = (v) => {
    if (!v || !Array.isArray(v.items) || (lv && v.lv && v.lv !== lv)) return;
    cb(v.items.filter((/** @type {any} */ it) => it && typeof it.key === 'string').slice(0, 24));
  };
  void Promise.resolve(store.get(GIFT_ITEMS_KEY)).then((r) => take(r?.[GIFT_ITEMS_KEY])).catch(() => {});
  store.onChanged((changes) => {
    if (changes?.[GIFT_ITEMS_KEY]) take(changes[GIFT_ITEMS_KEY].newValue);
  });
}

/**
 * 放送ページ(親)で: 会場のアイテムが押されたら、公式のギフト欄を開き(閉じていれば)、子の窓へ「このアイテムを押して」と合図する。
 * @param {Document} doc
 * @param {string} key
 * @param {GiftStore['set']} set
 * @param {{ direct?: boolean, onAt?: (at: number) => void }} [opts]  direct=1回で贈る(設定でオンの人だけ)
 * @returns {{ ok: boolean, reason?: string }}
 */
export function requestGiftItemPress(doc, key, set, opts = {}) {
  const at = Date.now();
  void set({ [GIFT_ITEMS_TAB_REQ_KEY]: { at }, [GIFT_ITEM_PRESS_REQ_KEY]: { at, key, ...(opts.direct ? { direct: true } : {}) } });
  opts.onAt?.(at);
  const open = [...doc.querySelectorAll('iframe')].some((f) => !/^chrome-extension:/.test(String(f.getAttribute('src') || '')) && f.closest('[class*="web-view-panel"], [class*="main-area"], [class*="rich-view"], [class*="gift"]') && f.getBoundingClientRect().width > 100);
  return open ? { ok: true } : openOfficialGiftPanel(doc);
}

/**
 * 子の窓が押したあとの結果(GIFT_ITEM_PRESS_RESULT_KEY)を待つ。reqAt が合うものだけ。来なければ null。
 * @param {GiftStore} store
 * @param {number} reqAt
 * @param {number} [ms]
 * @returns {Promise<any>}
 */
export function waitGiftPressResult(store, reqAt, ms = 10000) {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve(null); } }, ms);
    store.onChanged((changes) => {
      const v = changes?.[GIFT_ITEM_PRESS_RESULT_KEY]?.newValue;
      if (done || !v || v.reqAt !== reqAt) return;
      done = true;
      clearTimeout(t);
      resolve(v);
    });
  });
}

/**
 * chrome.storage.local を GiftStore の形で包む(content script 用)。
 * @returns {GiftStore}
 */
export function chromeGiftStore() {
  const c = /** @type {any} */ (globalThis).chrome;
  return {
    get: (k) => c.storage.local.get(k),
    set: (o) => c.storage.local.set(o).catch(() => {}),
    onChanged: (cb) => c.storage.onChanged.addListener((/** @type {any} */ ch, /** @type {string} */ area) => { if (area === 'local') cb(ch); })
  };
}

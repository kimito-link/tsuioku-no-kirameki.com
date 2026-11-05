// venueComposeBox.js — 会場モードから発言する1行の入力欄(2026-11-05 りんく「会場モードにも発言送信できたら」)。
//   会場を開いている間は公式のコメント欄が隠れるので、会場の帯に入力欄を置き、パネルの「コメント送信」と同じ経路で送る。
//   送り方(post)は呼び出し側が渡す: ニコ生=content script の postCommentFromContentAsync、YouTube=YT_SEND_COMMENT。
//   ★キー入力は会場の外へ伝えない(ページ側のショートカットや会場の Esc で閉じるに食われないように)。

import { findGiftSidebarItemsTabElement } from './giftSidebarRankTabPick.js';

/** @typedef {{ ok?: boolean, error?: unknown, reason?: unknown }} VenuePostResult */

/**
 * 送信結果を画面の一言にする(純関数)。
 * @param {VenuePostResult | null | undefined} res
 * @param {(reason: string) => string} [reasonText] 理由コードを日本語にする(YouTube 版用)
 * @returns {{ ok: boolean, text: string }}
 */
export function venueComposeResultText(res, reasonText) {
  if (res && res.ok) return { ok: true, text: '送信しました' };
  const err = String(res?.error || '').trim();
  if (err) return { ok: false, text: err };
  const reason = String(res?.reason || '').trim();
  const mapped = reason && typeof reasonText === 'function' ? String(reasonText(reason) || '') : '';
  return { ok: false, text: mapped || `送信できませんでした${reason ? `(${reason})` : ''}` };
}

/**
 * @param {(text: string) => Promise<VenuePostResult>} post
 * @param {{ doc?: Document, reasonText?: (reason: string) => string }} [opts]
 * @returns {HTMLFormElement}
 */
export function createVenueComposeBox(post, opts = {}) {
  const doc = opts.doc || document;
  const form = doc.createElement('form');
  form.className = 'nlsb-compose';
  // 2026-11-05 りんく「中央でもよい・小さすぎる」: 帯の一番上に1段まるごと使って中央に置く(右のボタン群の幅に左右されない)。
  form.style.cssText =
    'position:relative;display:flex;align-items:center;justify-content:center;gap:6px;margin:0;' +
    'flex:1 1 100%;order:-1;min-width:0;';
  const input = doc.createElement('input');
  input.type = 'text';
  input.className = 'nlsb-compose-input';
  input.placeholder = 'ここから発言';
  input.maxLength = 200;
  input.autocomplete = 'off';
  // 入力欄と結果の一言を重ねる枠(結果は入力欄の上に出し、打ち始めたら消える=周りのボタンを覆わない)。
  const box = doc.createElement('div');
  box.style.cssText = 'position:relative;flex:0 1 520px;min-width:0;display:flex;';
  input.style.cssText =
    'flex:1 1 auto;width:100%;min-width:0;height:34px;box-sizing:border-box;padding:4px 14px;border-radius:17px;' +
    'border:1px solid rgba(0,0,0,0.25);background:rgba(255,255,255,0.96);color:#1f2328;font-size:14px;';
  const btn = doc.createElement('button');
  btn.type = 'submit';
  btn.className = 'nlsb-comeview-btn nlsb-compose-send';
  btn.textContent = '送信';
  btn.disabled = true;
  btn.style.minHeight = '34px';
  const status = doc.createElement('span');
  status.className = 'nlsb-compose-status';
  // 結果の一言は入力欄の上に重ねる(下に浮かせると右のボタンを覆った・帯に並べると入力欄が横へ跳ぶ)。
  status.style.cssText =
    'position:absolute;inset:0;z-index:2;display:none;align-items:center;box-sizing:border-box;padding:0 14px;' +
    'border-radius:17px;border:1px solid currentColor;background:#fff;overflow:hidden;' +
    'font-size:12px;font-weight:600;line-height:1.3;white-space:normal;pointer-events:none;';
  status.hidden = true;
  let clearTimer = 0;
  const hide = () => {
    status.hidden = true;
    status.style.display = 'none';
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = 0;
  };
  let busy = false;
  const sync = () => {
    btn.disabled = busy || !input.value.trim();
  };
  /** @param {{ ok: boolean, text: string }} r */
  const show = (r) => {
    status.hidden = false;
    status.style.display = 'flex';
    status.textContent = r.text;
    status.title = r.text;
    status.style.color = r.ok ? '#1a7f37' : '#cf222e';
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = /** @type {any} */ (setTimeout(hide, r.ok ? 2500 : 12000));
  };
  const send = async () => {
    const text = input.value.replace(/\s+/g, ' ').trim();
    if (!text || busy) return;
    busy = true;
    sync();
    /** @type {VenuePostResult | null} */
    let res = null;
    try {
      res = await post(text);
    } catch (e) {
      res = { ok: false, error: e && typeof e === 'object' && 'message' in e ? String(/** @type {any} */ (e).message) : String(e) };
    }
    busy = false;
    const r = venueComposeResultText(res, opts.reasonText);
    if (r.ok) input.value = '';
    show(r);
    sync();
  };
  input.addEventListener('input', () => {
    hide();
    sync();
  });
  for (const type of ['keydown', 'keyup', 'keypress']) {
    input.addEventListener(type, (ev) => {
      ev.stopPropagation();
      const ke = /** @type {KeyboardEvent} */ (ev);
      if (type === 'keydown' && ke.key === 'Escape') input.blur();
    });
  }
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void send();
  });
  box.append(input, status);
  form.append(box, btn);
  return form;
}

/**
 * 会場から公式のギフト画面を開くボタン(2026-11-05 りんく「ここからアイテムを気軽に」→判断カード「公式ギフトの窓をすぐ開く」)。
 *   押すと先に会場をしまい(公式の画面が会場の帯に隠れないように・PC 実測でギフト欄の下半分が隠れた)、公式のボタンを押す。
 *   買う・贈る操作は公式の画面で本人がする(拡張は画面を開くところまで)。公式のボタンが見つからなければ会場を戻して一言出す。
 * @param {() => Promise<{ ok?: boolean, reason?: string }> | { ok?: boolean, reason?: string }} openGift
 * @param {{ doc?: Document, label?: string, reasonText?: (reason: string) => string, tuck?: (on: boolean) => void }} [opts]
 * @returns {HTMLButtonElement}
 */
export function createVenueGiftButton(openGift, opts = {}) {
  const doc = opts.doc || document;
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'nlsb-comeview-btn nlsb-gift-open';
  const label = opts.label || '🎁 ギフト';
  btn.textContent = label;
  btn.title = '公式のギフト画面を開きます(会場はいったんしまいます・右下の「▲ 会場に戻る」で戻せます)';
  btn.addEventListener('click', async () => {
    try { opts.tuck?.(true); } catch { /* しまえなくても開くのは試す */ }
    /** @type {{ ok?: boolean, reason?: string } | null} */
    let res = null;
    try { res = await openGift(); } catch { res = null; }
    if (res && res.ok) return;
    try { opts.tuck?.(false); } catch { /* 戻せなくても一言は出す */ }
    let why = '';
    try { why = res?.reason && opts.reasonText ? String(opts.reasonText(res.reason) || '') : ''; } catch { why = ''; }
    btn.textContent = why || `${label.replace(/^\S+\s+/, '')}のボタンが見つかりません`; // 「🎁 ギフト」→「ギフトの…」・YouTube は「スーパーチャットの…」
    setTimeout(() => { btn.textContent = label; }, 4000);
  });
  return btn;
}

const GIFT_SIDEBAR_ROOT_SEL =
  '[class*="gift-sidebar"], [class*="rich-view"], [class*="gift-modal"], [class*="gift-popup"], [class*="gift-balloon"], [class*="gift-dialog"], [class*="gift-overlay"], [class*="program-gift-richview"]';

/**
 * v0.1.1873: ギフト欄が開いたら「番組ギフト」(アイテム一覧)のタブへ切り替える。
 *   記録のために裏でランキングタブを開くので、そのまま開くとランキングが出てしまう(りんく 2026-11-05)。
 *   欄が描かれるのを待って 0.25 秒ごとに最大 12 回探し、見つけたら1回だけ押す。既に選ばれていれば押さない。
 * @param {Document} doc
 * @param {{ tries?: number, waitMs?: number, rootSel?: string }} [opts]  rootSel: ギフトの子の窓では 'body'(窓全体がギフト欄)
 */
export function showGiftItemsTabSoon(doc, opts = {}) {
  const win = doc.defaultView;
  if (!win || typeof doc.querySelectorAll !== 'function') return;
  let left = opts.tries ?? 12;
  const step = () => {
    left -= 1;
    try {
      for (const root of doc.querySelectorAll(opts.rootSel ?? GIFT_SIDEBAR_ROOT_SEL)) {
        const tab = findGiftSidebarItemsTabElement(root);
        if (!tab) continue;
        const clsOf = (/** @type {Element | null} */ el) => String(el?.getAttribute('class') || '');
        const sel =
          tab.getAttribute('aria-selected') === 'true' ||
          /(?:^|[\s_-])(?:active|selected|current)/i.test(`${clsOf(tab)} ${clsOf(tab.parentElement)}`);
        if (!sel) tab.click();
        return;
      }
    } catch {
      return;
    }
    if (left > 0) win.setTimeout(step, opts.waitMs ?? 250);
  };
  win.setTimeout(step, opts.waitMs ?? 250);
}

/**
 * ニコ生の公式ギフトボタンを押してギフト画面を開く(会場の「🎁 ギフト」から)。
 *   ボタンは CSS Modules のハッシュ名(___gift-button___HASH)なので部分一致で探す(content-entry の自動取得と同じ探し方)。
 *   記録用に裏でギフト欄を開くときの透明化(#nls-stealth-gift-sidebar)が残っていると本人に見えないので外す。
 * @param {Document} doc
 * @returns {{ ok: boolean, reason?: string }}
 */
export function openOfficialGiftPanel(doc) {
  try {
    const btn =
      doc.querySelector('[class*="gift-button"]') ||
      doc.querySelector('button[aria-label*="ギフト"]') ||
      doc.querySelector('button[title*="ギフト"]');
    if (!btn || typeof (/** @type {any} */ (btn)).click !== 'function') return { ok: false, reason: 'no-button' };
    doc.getElementById('nls-stealth-gift-sidebar')?.remove();
    /** @type {HTMLElement} */ (btn).click();
    showGiftItemsTabSoon(doc);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** v0.1.1874: 会場の「🎁 ギフト」を押した合図(親のページ → ギフトの子の窓)。chrome.storage.local のキー */
export const GIFT_ITEMS_TAB_REQ_KEY = 'nls_gift_items_tab_req';

/**
 * v0.1.1874: ギフトの子の窓(gift.nicovideo.jp/…/purchase)で、会場から開いた合図を受けたら番組ギフトのタブへ切り替える。
 *   タブは子の窓の中にあり、親のページからは押せない(別ドメイン)ので、子の窓の content script が押す。合図から10秒以内だけ。
 * @param {Window} win
 * @param {(cb: (changes: Record<string, { newValue?: any }>) => void) => void} onStorageChanged
 */
export function startGiftItemsTabResponder(win, onStorageChanged) {
  let top = true;
  try { top = win.self === win.top; } catch { top = false; }
  if (top || !/(^|\.)gift\.nicovideo\.jp$/.test(String(win.location.hostname || '')) || !/\/purchase/.test(String(win.location.pathname || ''))) return;
  onStorageChanged((changes) => {
    const at = Number(changes?.[GIFT_ITEMS_TAB_REQ_KEY]?.newValue?.at || 0);
    if (at && Date.now() - at < 10000) showGiftItemsTabSoon(win.document, { rootSel: 'body' });
  });
}

/**
 * v0.1.1875: 会場に公式ギフト欄と同じアイテムを並べる帯(りんく 2026-11-05 の選択「アイテムを並べ確認は公式」)。
 *   並びは公式のギフト欄を一度開いたときに読んだもの(画像と pt)。押すと会場をしまい、公式の欄で同じアイテムを押す。
 *   贈るかどうかの確認は公式の画面で本人がする(拡張は確認の「贈る」を押さない)。並びがまだ無ければ帯は出さない。
 * @param {{ subscribe: (cb: (items: { key: string, name: string, pt: string, img: string }[]) => void) => void, press: (key: string) => Promise<{ ok?: boolean, reason?: string }> | { ok?: boolean, reason?: string }, tuck?: (on: boolean) => void, doc?: Document }} opts
 * @returns {HTMLSpanElement}
 */
export function createVenueGiftStrip(opts) {
  const doc = opts.doc || document;
  const strip = doc.createElement('span');
  strip.className = 'nlsb-gift-strip';
  strip.style.cssText = 'display:none;align-items:center;gap:4px;max-width:46vw;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;vertical-align:middle';
  let sig = '';
  /** @param {{ key: string, name: string, pt: string, img: string }[]} items */
  const render = (items) => {
    const next = JSON.stringify(items.map((it) => [it.key, it.img]));
    if (next === sig) return; // 同じ並びなら作り直さない(ちらつかせない)
    sig = next;
    strip.replaceChildren();
    for (const it of items) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'nlsb-comeview-btn nlsb-gift-item';
      b.title = `${it.name ? it.name + ' ' : ''}${it.pt}(公式のギフト欄で確認してから贈ります)`;
      b.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;padding:2px 4px;min-width:40px;line-height:1.1;flex:0 0 auto';
      if (/^https:\/\//.test(it.img)) {
        const im = doc.createElement('img');
        im.src = it.img;
        im.alt = it.name || '';
        im.loading = 'lazy';
        im.referrerPolicy = 'no-referrer';
        im.style.cssText = 'width:26px;height:26px;object-fit:contain;border-radius:4px';
        im.addEventListener('error', () => { im.replaceWith(doc.createTextNode('🎁')); }, { once: true });
        b.append(im);
      } else {
        b.append(doc.createTextNode('🎁'));
      }
      const pt = doc.createElement('span');
      pt.textContent = it.pt.replace(/\s+/g, '');
      pt.style.cssText = 'font-size:10px;white-space:nowrap';
      b.append(pt);
      b.addEventListener('click', async () => {
        try { opts.tuck?.(true); } catch { /* しまえなくても押すのは試す */ }
        let res = null;
        try { res = await opts.press(it.key); } catch { res = null; }
        if (res && res.ok) return;
        try { opts.tuck?.(false); } catch { /* 戻せなくても一言は出す */ }
        pt.textContent = '開けません';
        setTimeout(() => { pt.textContent = it.pt.replace(/\s+/g, ''); }, 3000);
      });
      strip.append(b);
    }
    strip.style.display = items.length ? 'inline-flex' : 'none';
  };
  try { opts.subscribe(render); } catch { /* 並びが読めなければ帯を出さないだけ */ }
  return strip;
}

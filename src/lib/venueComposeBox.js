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
 * @param {{ doc?: Document, label?: string, reasonText?: (reason: string) => string, tuck?: (on: boolean, note?: string) => void, stripHint?: boolean }} [opts]
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
    // v0.1.1885: 会場の帯にもアイテムが並ぶことを書く(りんく「でるけど それも説明ないと不親切」)。YouTube には帯が無いので opts.stripHint で切り替える
    const tail = opts.stripHint ? '右下の「▲ 会場に戻る」で会場に戻ると、帯に同じアイテムが並び、会場のまま押して贈れます' : '戻るときは右下の「▲ 会場に戻る」';
    try { opts.tuck?.(true, `公式の${label.replace(/^\S+\s/, '')}の画面を開きました(ここではまだ何も使っていません)。右の欄で選んで公式のボタンを押しても贈れます。${tail}`); } catch { /* しまえなくても開くのは試す */ }
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

/**
 * v0.1.1880: 公式のギフト欄の上端(「ギフト」の見出しと所持ポイント)が画面の上に隠れていたら、見える位置までページを送る
 *   (りんく 2026-11-05 のスクショ: ページが下に送られていて欄の見出しが見えず、何が開いたか分からなかった)。
 * @param {Document} doc
 */
export function scrollGiftPanelIntoView(doc) {
  try {
    const f = [...doc.querySelectorAll('iframe')].find((x) => /gift\.nicovideo\.jp/.test(String(x.getAttribute('src') || '')) && x.getBoundingClientRect().width > 100);
    const el = /** @type {Element | null} */ (f?.closest('[class*="gift"], [class*="rich-view"]') || f || null);
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const view = doc.defaultView;
    if (view && (top < 0 || top > view.innerHeight * 0.6)) view.scrollBy({ top: top - 80, behavior: 'smooth' });
  } catch { /* 送れなくても開いたまま */ }
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
    setTimeout(() => scrollGiftPanelIntoView(doc), 600);
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
 *   v0.1.1881: 2回押し(既定)も会場のまま贈る。1回目は「贈る?」、3秒以内の2回目でアイテムと公式の確認の「贈る」を押す(りんく「2回押すといろんなページに飛ぶ」)。並びがまだ無ければ帯は出さない。
 *   v0.1.1879: 設定「1回で贈る」(既定オフ・帯の端の「1回」で切り替え)がオンの人は、1回押すと会場のまま公式の確認まで押して贈る
 *   (りんく 2026-11-05 の選択)。贈れたら「贈りました」、確認が見つからなければ会場をしまって公式の欄を見せる。続けて押しても2秒は受けない。
 * @param {{ subscribe: (cb: (items: { key: string, name: string, pt: string, img: string }[]) => void) => void, press: (key: string, o?: { direct?: boolean }) => Promise<{ ok?: boolean, reason?: string, sent?: boolean, notFound?: boolean, price?: string }> | { ok?: boolean, reason?: string, sent?: boolean, notFound?: boolean, price?: string }, tuck?: (on: boolean, note?: string) => void, oneTap?: { get: () => Promise<boolean> | boolean, set: (on: boolean) => void }, doc?: Document }} opts
 * @returns {HTMLSpanElement}
 */
export function createVenueGiftStrip(opts) {
  const doc = opts.doc || document;
  const strip = doc.createElement('span');
  strip.className = 'nlsb-gift-strip';
  strip.style.cssText = 'display:none;align-items:center;gap:4px;max-width:46vw;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;vertical-align:middle';
  let sig = '';
  let armed = '';
  let direct = false;
  let busyUntil = 0;
  /** @type {HTMLButtonElement | null} */
  let modeBtn = null;
  // v0.1.1885: 帯の先頭に「どう押すと何が起きるか」を常に見える文字で出す(title はマウスを載せないと出ない)
  const hint = doc.createElement('span');
  hint.className = 'nlsb-gift-hint';
  hint.style.cssText = 'flex:0 0 auto;font-size:10px;line-height:1.15;white-space:nowrap;opacity:.85';
  const paintMode = () => {
    hint.textContent = direct ? '押すと公式の確認' : '2回押すと公式の確認';
    hint.title = direct ? 'アイテムを押すと公式の購入の確認が出ます。公式の「購入します」を押すと贈られます(手数料が足されます)' : 'アイテムを1回押すと「贈る?」と出ます。もう一度押すと公式の購入の確認が出ます。公式の「購入します」を押すと贈られます(手数料が足されます)';
    for (const b of strip.querySelectorAll('.nlsb-gift-item')) {
      const base = String(b.getAttribute('data-label') || '');
      /** @type {HTMLElement} */ (b).title = direct ? `${base}(押すと公式の購入の確認が出ます)` : `${base}(2回押すと公式の購入の確認が出ます・1回目は「贈る?」と出るだけ)`;
    }
    if (!modeBtn) return;
    modeBtn.textContent = direct ? '1回' : '2回';
    modeBtn.setAttribute('aria-pressed', direct ? 'true' : 'false');
    modeBtn.title = direct ? '1回押すと公式の確認が出ます(押すと2回押しに戻す)' : '2回押すと公式の確認が出ます(押すと1回押しにする)';
    modeBtn.style.background = direct ? '#c0392b' : '';
    modeBtn.style.color = direct ? '#fff' : '';
  };
  if (opts.oneTap) {
    modeBtn = doc.createElement('button');
    modeBtn.type = 'button';
    modeBtn.className = 'nlsb-comeview-btn nlsb-gift-mode';
    modeBtn.style.cssText = 'flex:0 0 auto;font-size:10px;padding:2px 4px';
    modeBtn.addEventListener('click', () => { direct = !direct; armed = ''; paintMode(); try { opts.oneTap?.set(direct); } catch { /* 保存できなくても今は効く */ } });
    paintMode();
    void Promise.resolve(opts.oneTap.get()).then((on) => { direct = on === true; paintMode(); }).catch(() => {});
  }
  /** @param {{ key: string, name: string, pt: string, img: string }[]} items */
  const render = (items) => {
    const next = JSON.stringify(items.map((it) => [it.key, it.img]));
    if (next === sig) return; // 同じ並びなら作り直さない(ちらつかせない)
    sig = next;
    strip.replaceChildren(hint);
    for (const it of items) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'nlsb-comeview-btn nlsb-gift-item';
      b.setAttribute('data-label', `${it.name ? it.name + ' ' : ''}${it.pt}`);
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
      const send = async () => {
        if (Date.now() < busyUntil) return; // 続けて押しても二重に贈らない
        busyUntil = Date.now() + 32000; // 結果が返るまで(本人が公式で確定するのを最長30秒待つ)は受けない
        pt.textContent = '公式で確認…'; // v0.1.1887: 公式の購入の確認を本人が押すまで待つ
        let res = null;
        try { res = await opts.press(it.key, { direct: true }); } catch { res = null; }
        if (res && res.ok && res.sent) {
          pt.textContent = res.price ? `贈りました(${res.price})` : '贈りました';
        } else if (res && res.notFound) {
          pt.textContent = '見つかりません'; // 公式の欄にこのアイテムが無かった(何も押していない)
        } else if (res && res.ok) {
          pt.textContent = '贈っていません'; // 公式の確認で購入を押さなかった(30秒)・ポイントは減っていない
        } else {
          pt.textContent = '開けません';
        }
        busyUntil = Date.now() + 2000;
        setTimeout(() => { pt.textContent = it.pt.replace(/\s+/g, ''); }, 3000);
      };
      b.addEventListener('click', async () => {
        if (direct) { await send(); return; }
        // v0.1.1881: 2回押しも会場のまま贈る(1回目は「贈る?」と出すだけ・3秒以内の2回目で贈る)。
        //   以前は2回目で公式の欄へ飛ばしていたが、りんく「2回押すといろんなページに飛ぶのでアイテムを並べる意味をなしていない」
        if (armed !== it.key) {
          armed = it.key;
          pt.textContent = `${it.pt.replace(/\s+/g, '')}贈る?`; // 何を使うか見えたまま確かめる
          setTimeout(() => { if (armed === it.key) { armed = ''; pt.textContent = it.pt.replace(/\s+/g, ''); } }, 3000);
          return;
        }
        armed = '';
        await send();
      });
      strip.append(b);
    }
    if (modeBtn) strip.append(modeBtn);
    paintMode();
    strip.style.display = items.length ? 'inline-flex' : 'none';
  };
  try { opts.subscribe(render); } catch { /* 並びが読めなければ帯を出さないだけ */ }
  return strip;
}

// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { pickVenueGiftItems, readGiftItems, pressGiftItem, startGiftItemsPublisher, subscribeGiftItems, requestGiftItemPress, giftItemSkeleton, findGiftConfirmButton, newGiftDrawers, describeGiftDrawers, waitGiftPressResult, readGiftBalance, giftPressOutcome, GIFT_ITEMS_KEY, GIFT_ITEM_PRESS_REQ_KEY, GIFT_ITEM_PRESS_RESULT_KEY } from './giftItemsMirror.js';
import { createVenueGiftStrip } from './venueComposeBox.js';

// 2026-11-05 りんくの画面(番組ギフト・3列の枠・画像と「500 pt」の数字と pt が別の部品)に似せた形
const PANEL = `
  <section class="wrapper"><span>りんく さん</span><span>61</span><span>pt</span><button class="point-charge-button">+</button></section>
  <ul><li class="item"><button class="button">番組ギフト</button></li><li class="item"><button class="button">ランキング</button></li></ul>
  <div class="lottery"><p>あと <span>670pt</span>で放送者が福引券1枚獲得!</p><img src="https://cdn.example/ticket.png"></div>
  <div class="grid">
    <div class="card" data-id="a"><img src="https://cdn.example/a.png" alt="ハゲ"><p class="price"><span>500</span><small>pt</small></p></div>
    <div class="card" data-id="b"><img src="https://cdn.example/b.png" alt="ハゲ小"><p class="price"><span>100</span><small>pt</small></p></div>
    <div class="card" data-id="c"><img src="https://cdn.example/c.png" alt=""><p class="price"><span>3,000</span><small>pt</small></p></div>
  </div>`;

describe('公式ギフト欄のアイテムを読む', () => {
  it('枠ごとに画像と pt を読み、所持ポイント欄と「あと ◯pt」の案内は除く', () => {
    document.body.innerHTML = PANEL;
    const items = readGiftItems(document);
    expect(items.map((it) => it.pt)).toEqual(['500pt', '100pt', '3,000pt']);
    expect(items[0].name).toBe('ハゲ');
    expect(items[0].img).toBe('https://cdn.example/a.png');
    expect(items[0].el.getAttribute('data-id')).toBe('a');
    expect(items[2].key).toMatch(/c\.png\|3,000pt$/); // 名前が無ければ画像で見分ける
  });
  it('会場から押されたアイテムだけを押す(贈るの確認は押さない)', () => {
    document.body.innerHTML = PANEL;
    /** @type {string[]} */
    const hit = [];
    for (const c of document.querySelectorAll('.card')) c.addEventListener('click', () => { hit.push(String(c.getAttribute('data-id'))); });
    expect(pressGiftItem(document, 'ハゲ小|100pt')).toBe(true);
    expect(hit).toEqual(['b']);
    expect(pressGiftItem(document, 'ない|1pt')).toBe(false);
  });
  it('骨組みは部品の種類だけ(文字は入らない)', () => {
    document.body.innerHTML = PANEL;
    const sk = giftItemSkeleton(document);
    expect(sk?.chain).toMatch(/^span\(0\) < p\.price/);
    expect(sk?.outline).not.toMatch(/ハゲ|500/);
  });
});

describe('会場に出すアイテムを選ぶ', () => {
  it('安い順・1,000pt まで・会員権は出さない(RC 実測の並び)', () => {
    const raw = ['プレミアム会員権（30日）|1,400 pt', '召喚獣|50,000 pt', '栗|300 pt', 'お月見（5種ランダム）|1,000 pt', '焼き芋（音付き）|3,000 pt', '草|50 pt', 'ニコる|50 pt', 'ひよこ|100 pt', 'プレミアム会員権（7日）|500 pt']
      .map((k) => ({ name: k.split('|')[0], pt: k.split('|')[1], key: k }));
    expect(pickVenueGiftItems(raw).map((it) => it.name)).toEqual(['草', 'ニコる', 'ひよこ', '栗', 'お月見（5種ランダム）']);
  });
});

describe('子の窓と放送ページのやりとり', () => {
  /** @returns {any} */
  const memStore = () => {
    /** @type {Record<string, any>} */
    const data = {};
    /** @type {((c: any) => void)[]} */
    const subs = [];
    return {
      data,
      get: async (/** @type {string} */ k) => ({ [k]: data[k] }),
      set: async (/** @type {Record<string, any>} */ o) => {
        const ch = {};
        for (const [k, v] of Object.entries(o)) { data[k] = v; /** @type {any} */ (ch)[k] = { newValue: v }; }
        for (const f of subs) f(ch);
      },
      onChanged: (/** @type {(c: any) => void} */ f) => { subs.push(f); }
    };
  };
  it('子の窓が並びを置き、会場の帯に出て、押すと子の窓の同じアイテムが押される', async () => {
    document.body.innerHTML = PANEL;
    const store = memStore();
    /** @type {string[]} */
    const hit = [];
    for (const c of document.querySelectorAll('.card')) c.addEventListener('click', () => { hit.push(String(c.getAttribute('data-id'))); });
    const frameWin = /** @type {any} */ ({ self: 1, top: 2, location: { hostname: 'gift.nicovideo.jp', pathname: '/live/lv9/purchase' }, document, setInterval: window.setInterval.bind(window), clearInterval: window.clearInterval.bind(window), setTimeout: window.setTimeout.bind(window) });
    startGiftItemsPublisher(frameWin, store);
    await new Promise((r) => setTimeout(r, 700));
    expect(store.data[GIFT_ITEMS_KEY].lv).toBe('lv9');
    expect(store.data[GIFT_ITEMS_KEY].items).toHaveLength(2); // 3,000pt は会場に出さない
    /** @type {any[]} */
    let shown = [];
    subscribeGiftItems(store, '/watch/lv9', (items) => { shown = items; });
    await new Promise((r) => setTimeout(r, 10));
    expect(shown.map((it) => it.pt)).toEqual(['100pt', '500pt']); // 安い順
    /** @type {any[]} */
    let other = [];
    subscribeGiftItems(store, '/watch/lv1', (items) => { other = items; });
    await new Promise((r) => setTimeout(r, 10));
    expect(other).toEqual([]); // 別の放送の並びは出さない
    const strip = createVenueGiftStrip({ subscribe: (cb) => subscribeGiftItems(store, '/watch/lv9', cb), press: (key) => requestGiftItemPress(document, key, store.set), doc: document });
    await new Promise((r) => setTimeout(r, 10));
    const btns = strip.querySelectorAll('button');
    expect(btns).toHaveLength(2);
    expect(strip.style.display).toBe('inline-flex');
    /** @type {HTMLButtonElement} */ (btns[1]).click();
    await new Promise((r) => setTimeout(r, 50));
    expect(store.data[GIFT_ITEM_PRESS_REQ_KEY]).toBeUndefined(); // 1回目は押さない
    expect(btns[1].textContent).toMatch(/贈る\?/);
    /** @type {HTMLButtonElement} */ (btns[1]).click();
    await new Promise((r) => setTimeout(r, 900));
    expect(store.data[GIFT_ITEM_PRESS_REQ_KEY].key).toBe('ハゲ|500pt');
    expect(hit).toEqual(['a']);
  });
});

describe('1回で贈る(設定でオンの人だけ)', () => {
  /** @returns {any} */
  const memStore = () => {
    /** @type {Record<string, any>} */
    const data = {};
    /** @type {((c: any) => void)[]} */
    const subs = [];
    return {
      data,
      get: async (/** @type {string} */ k) => ({ [k]: data[k] }),
      set: async (/** @type {Record<string, any>} */ o) => {
        const ch = {};
        for (const [k, v] of Object.entries(o)) { data[k] = v; /** @type {any} */ (ch)[k] = { newValue: v }; }
        for (const f of subs) f(ch);
      },
      onChanged: (/** @type {(c: any) => void} */ f) => { subs.push(f); }
    };
  };
  it('確認の「贈る」だけを探す(購入・キャンセルや前から見えていたものは押さない)', () => {
    document.body.innerHTML = '<button>ポイント購入</button><button>キャンセル</button><button id="old">贈る</button><div><button id="new">贈る</button></div>';
    const vis = (/** @type {Element} */ el) => { el.getBoundingClientRect = () => /** @type {any} */ ({ width: 80, height: 30 }); };
    for (const b of document.querySelectorAll('button')) vis(b);
    const old = /** @type {Element} */ (document.getElementById('old'));
    expect(findGiftConfirmButton(document, new Set([old]))?.id).toBe('new');
    expect(findGiftConfirmButton(document)?.id).toBe('old');
  });
  it('オンなら1回押しで、アイテムを押したあとに出た確認の「贈る」まで押して「贈りました」と出す', async () => {
    document.body.innerHTML = '<div id="bal">テスト さん 1,000 pt</div>' + PANEL;
    const store = memStore();
    /** @type {string[]} */
    const hit = [];
    for (const c of document.querySelectorAll('.card')) {
      c.addEventListener('click', () => {
        hit.push(String(c.getAttribute('data-id')));
        const dlg = document.createElement('div');
        dlg.innerHTML = '<p>このギフトを贈りますか</p><button class="cancel">キャンセル</button><button class="ok">贈る</button>';
        for (const b of dlg.querySelectorAll('button')) b.getBoundingClientRect = () => /** @type {any} */ ({ width: 80, height: 30 });
        dlg.querySelector('.ok')?.addEventListener('click', () => { hit.push('confirm'); const bal = document.getElementById('bal'); if (bal) bal.textContent = 'テスト さん 985 pt'; setTimeout(() => { if (bal) bal.textContent = 'テスト さん 945 pt'; }, 350); }); // 残高は段階的に減る(PC 実測 2377→2362→2344)
        document.body.append(dlg);
      });
    }
    const frameWin = /** @type {any} */ ({ self: 1, top: 2, location: { hostname: 'gift.nicovideo.jp', pathname: '/live/lv9/purchase' }, document, setInterval: window.setInterval.bind(window), clearInterval: window.clearInterval.bind(window), setTimeout: window.setTimeout.bind(window) });
    startGiftItemsPublisher(frameWin, store);
    await new Promise((r) => setTimeout(r, 700));
    let saved = false;
    const strip = createVenueGiftStrip({
      subscribe: (cb) => subscribeGiftItems(store, '/watch/lv9', cb),
      press: async (key, o) => { let at = 0; const r = requestGiftItemPress(document, key, store.set, { direct: o?.direct === true, onAt: (a) => { at = a; } }); const v = await waitGiftPressResult(store, at); return { ok: r.ok || !!v, ...giftPressOutcome(v) }; },
      oneTap: { get: () => false, set: (on) => { saved = on; } },
      doc: document
    });
    await new Promise((r) => setTimeout(r, 10));
    const mode = /** @type {HTMLButtonElement} */ (strip.querySelector('.nlsb-gift-mode'));
    expect(mode.textContent).toBe('2回'); // 既定はオフ
    mode.click();
    expect(saved).toBe(true);
    expect(mode.textContent).toBe('1回');
    const item = /** @type {HTMLButtonElement} */ (strip.querySelectorAll('.nlsb-gift-item')[1]);
    item.click();
    item.click(); // 続けて押しても二重には贈らない
    await new Promise((r) => setTimeout(r, 2600)); // 残高が落ち着いたら結果を書く(途中の値で数えない)
    expect(hit).toEqual(['a', 'confirm']);
    expect(store.data[GIFT_ITEM_PRESS_RESULT_KEY].confirmed).toBe(true);
    expect(store.data[GIFT_ITEM_PRESS_RESULT_KEY].spent).toBe(55);
    expect(store.data[GIFT_ITEM_PRESS_RESULT_KEY].clicks.some((/** @type {any} */ c) => c.text === '贈る' && c.trusted === false)).toBe(true);
    expect(item.textContent).toMatch(/贈りました\(55pt\)/);
  }, 10000);
});

describe('帯のアイテムが公式の欄の奥にあっても押せる', () => {
  it('41件目より後ろのアイテムも見つけて押す', () => {
    const cards = Array.from({ length: 60 }, (_, i) => `<div class="card" data-id="${i}"><img src="https://cdn.example/${i}.png" alt="品${i}"><p class="price"><span>${1000 + i}</span><small>pt</small></p></div>`).join('');
    document.body.innerHTML = `<div class="grid">${cards}</div>`;
    /** @type {string[]} */
    const hit = [];
    for (const c of document.querySelectorAll('.card')) c.addEventListener('click', () => { hit.push(String(c.getAttribute('data-id'))); });
    expect(pressGiftItem(document, '品55|1055pt')).toBe(true);
    expect(hit).toEqual(['55']);
  });
});

describe('購入の引き出し(drawer)の中の確定ボタン', () => {
  it('新しく開いた引き出しの中の「購入する」を押す候補にし、ポイント購入やキャンセルは選ばない・値段を読む', () => {
    document.body.innerHTML = '<button id="charge">ポイントを購入</button><div class="drawer-content" id="d"><p>1個30 pt (+ 3 pt) 価格:33 pt</p><p>購入後のキャンセルはできません</p><button id="cancel">キャンセル</button><button id="buy">購入する</button></div>';
    for (const el of document.querySelectorAll('button, .drawer-content')) /** @type {any} */ (el).getBoundingClientRect = () => ({ width: 80, height: 30 });
    const drawers = newGiftDrawers(document, new Set());
    expect(drawers.map((d) => d.id)).toEqual(['d']);
    expect(findGiftConfirmButton(document, new Set(), drawers)?.id).toBe('buy');
    expect(findGiftConfirmButton(document, new Set(), [])).toBeNull(); // 引き出しの外では「購入」は押さない
    const info = describeGiftDrawers(drawers);
    expect(info.price).toBe('33pt');
    expect(info.buttons.map((b) => b.text)).toEqual(['キャンセル', '購入する']);
  });
});

describe('贈れたかを残高で確かめる(v0.1.1884)', () => {
  it('ギフト窓の「〇〇 さん 2,498 pt」から残高を読む', () => {
    document.body.innerHTML = '<div>ギフト 君斗りんく＠クリエイター応援 さん 2,498 pt 番組ギフト マイギフト</div><p>100 pt</p>';
    expect(readGiftBalance(document)).toBe(2498);
    document.body.innerHTML = '<div>ギフト 番組ギフト 100 pt</div>';
    expect(readGiftBalance(document)).toBe(null);
  });
});

describe('帯の説明(v0.1.1885)', () => {
  it('帯の先頭に押し方を見える文字で出し、1回押しにすると文言が変わる', async () => {
    const { createVenueGiftStrip } = await import('./venueComposeBox.js');
    /** @type {any} */
    let feed = null;
    const strip = createVenueGiftStrip(/** @type {any} */ ({ subscribe: (/** @type {any} */ f) => { feed = f; }, press: async () => ({ ok: true }), oneTap: { get: () => false, set: () => {} } }));
    feed([{ key: 'a|30 pt', name: 'a', pt: '30 pt', img: '' }]);
    expect(strip.querySelector('.nlsb-gift-hint')?.textContent).toBe('2回押すと公式の確認');
    /** @type {HTMLElement} */ (strip.querySelector('.nlsb-gift-mode')).click();
    expect(strip.querySelector('.nlsb-gift-hint')?.textContent).toBe('押すと公式の確認');
  });
});

describe('贈れたかは残高で決める(v0.1.1886)', () => {
  it('確定ボタンを押していなくても、残高が減っていれば贈れた扱いにして実際の値段を出す', () => {
    expect(giftPressOutcome({ found: true, confirmed: false, spent: 55 })).toEqual({ sent: true, notFound: false, price: '55pt' });
    expect(giftPressOutcome({ found: true, confirmed: false, spent: 0, price: '' })).toEqual({ sent: false, notFound: false, price: '' });
    expect(giftPressOutcome({ found: false, confirmed: false })).toEqual({ sent: false, notFound: true, price: '' });
    expect(giftPressOutcome(null).sent).toBe(false);
  });
});

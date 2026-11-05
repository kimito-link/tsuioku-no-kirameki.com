// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { pickVenueGiftItems, readGiftItems, pressGiftItem, startGiftItemsPublisher, subscribeGiftItems, requestGiftItemPress, giftItemSkeleton, GIFT_ITEMS_KEY, GIFT_ITEM_PRESS_REQ_KEY } from './giftItemsMirror.js';
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
    await new Promise((r) => setTimeout(r, 900));
    expect(store.data[GIFT_ITEM_PRESS_REQ_KEY].key).toBe('ハゲ|500pt');
    expect(hit).toEqual(['a']);
  });
});

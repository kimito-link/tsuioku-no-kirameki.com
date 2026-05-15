/** @vitest-environment happy-dom */
/**
 * 送り主別 pt ランキングの正本（`ul.gift-history-list` の `li.item` 行）に対し、
 * `scrapeGiftHistoryList`（iframe 経路）と `scrapeGiftHistoryFromDom`（watch bundle 経路）
 * が同一 DOM で整合するか・どこで乖離するかを固定する。
 */
import { describe, it, expect } from 'vitest';
import { scrapeGiftHistoryList } from './scrapeGiftHistoryList.js';
import {
  scrapeGiftHistoryFromDom,
  aggregateGiftHistoryByUser
} from './officialEventBannerDom.js';
import { aggregateGiftHistoryThrows } from './mergeGiftHistoryThrows.js';

const NOW = 1_700_000_000_000;

/**
 * @param {import('./scrapeGiftHistoryList.js').GiftHistoryItem[]} items
 * @returns {import('./officialEventBannerDom.js').GiftHistoryEntry[]}
 */
function listItemsToGiftHistoryEntries(items) {
  return items.map((it) => ({
    time: String(it.time || '').trim(),
    advertiserName: String(it.senderName || '').trim(),
    isAnonymous: String(it.senderName || '').trim() === '名無し',
    point: Number(it.points) || 0,
    thumbnailUrl: String(it.thumbnailUrl || '').trim(),
    giftName: String(it.itemName || '').trim(),
    advertiserAvatarUrl: String(it.senderAvatarUrl || '').trim()
  }));
}

describe('gift-history scraper parity (list vs fromDom)', () => {
  it('公式履歴タブ相当 DOM（img 付き各行）では行数・送り主・pt・時刻が一致', () => {
    document.body.innerHTML = `
      <ul class="gift-history-list">
        <li class="item">
          <img class="thumbnail" src="https://x.cdn/stamp.png" alt="８８８８">
          <p class="time">19:58</p>
          <p class="text">
            <span class="advertiser-name">くろかな <small class="honorific">さん</small></span>
          </p>
          <p class="point">30 <small class="point-unit">pt</small></p>
        </li>
        <li class="item">
          <img class="thumbnail" src="https://x.cdn/wakotsu.png" alt="わこつ茶">
          <p class="time">11:13</p>
          <p class="text">
            <span class="advertiser-name">名無し <small class="honorific">さん</small></span>
          </p>
          <p class="point">300 <small class="point-unit">pt</small></p>
        </li>
        <li class="item">
          <img class="thumbnail" src="https://x.cdn/wakotsu.png" alt="わこつ茶">
          <p class="time">07:39</p>
          <p class="text">
            <span class="advertiser-name">ケロ彦 <small class="honorific">さん</small></span>
          </p>
          <p class="point">50 <small class="point-unit">pt</small></p>
        </li>
      </ul>`;
    const list = scrapeGiftHistoryList(document);
    const fromDom = scrapeGiftHistoryFromDom(document);
    expect(fromDom).not.toBeNull();
    expect(list.totalCount).toBe(/** @type {any} */ (fromDom).length);
    for (let i = 0; i < list.items.length; i++) {
      expect(list.items[i].senderName).toBe(fromDom[i].advertiserName);
      expect(list.items[i].points).toBe(fromDom[i].point);
      expect(list.items[i].time).toBe(fromDom[i].time);
      expect(list.items[i].itemName).toBe(fromDom[i].giftName);
      expect(list.items[i].senderAvatarUrl || '').toBe(
        String(fromDom[i].advertiserAvatarUrl || '')
      );
    }
  });

  it('送り主 user icon img があれば list/fromDom/throws で URL が一致', () => {
    const icon = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/9/95239.jpg';
    document.body.innerHTML = `
      <ul class="gift-history-list">
        <li class="item">
          <img src="${icon}" alt="" class="face">
          <img class="thumbnail" src="g.png" alt="ギフト">
          <p class="time">1:00</p>
          <span class="advertiser-name">ネギトロ<small class="honorific">さん</small></span>
          <p class="point">30 <small class="point-unit">pt</small></p>
        </li>
      </ul>`;
    const list = scrapeGiftHistoryList(document);
    const fromDom = scrapeGiftHistoryFromDom(document);
    expect(list.items[0].senderAvatarUrl).toBe(icon);
    expect(fromDom?.[0].advertiserAvatarUrl).toBe(icon);
    const throws = aggregateGiftHistoryThrows(list.items, NOW);
    expect(throws.next[0].avatarUrl).toBe(icon);
  });

  it('同一送り主の複数行（例: 30pt×4）は両スクレイパで 4 行・集計は 120pt / 4 件', () => {
    document.body.innerHTML = `
      <ul class="gift-history-list">
        <li class="item">
          <img class="thumbnail" src="g.png" alt="ギフトA">
          <p class="time">1:00:01</p>
          <span class="advertiser-name">ネギトロ<small class="honorific">さん</small></span>
          <p class="point">30 <small class="point-unit">pt</small></p>
        </li>
        <li class="item">
          <img class="thumbnail" src="g.png" alt="ギフトA">
          <p class="time">1:00:02</p>
          <span class="advertiser-name">ネギトロ<small class="honorific">さん</small></span>
          <p class="point">30 <small class="point-unit">pt</small></p>
        </li>
        <li class="item">
          <img class="thumbnail" src="g.png" alt="ギフトA">
          <p class="time">1:00:03</p>
          <span class="advertiser-name">ネギトロ<small class="honorific">さん</small></span>
          <p class="point">30 <small class="point-unit">pt</small></p>
        </li>
        <li class="item">
          <img class="thumbnail" src="g.png" alt="ギフトA">
          <p class="time">1:00:04</p>
          <span class="advertiser-name">ネギトロ<small class="honorific">さん</small></span>
          <p class="point">30 <small class="point-unit">pt</small></p>
        </li>
      </ul>`;
    const list = scrapeGiftHistoryList(document);
    const fromDom = scrapeGiftHistoryFromDom(document);
    expect(list.totalCount).toBe(4);
    expect(fromDom).not.toBeNull();
    expect(/** @type {any} */ (fromDom).length).toBe(4);
    const byUser = aggregateGiftHistoryByUser(/** @type {any} */ (fromDom));
    expect(byUser).toHaveLength(1);
    expect(byUser[0]).toMatchObject({ name: 'ネギトロ', totalPoints: 120, giftCount: 4 });
    const throws = aggregateGiftHistoryThrows(list.items, NOW);
    expect(throws.next).toHaveLength(1);
    expect(throws.next[0]).toMatchObject({
      nickname: 'ネギトロ',
      throwCount: 4,
      totalPoints: 120
    });
  });

  it('CSS Modules 風 class でも両方が同じ 1 行を拾える', () => {
    document.body.innerHTML = `
      <ul class="___gift-history-list___ABC123">
        <li class="___item___XYZ789">
          <img class="___thumbnail___DEF456" src="x.png" alt="アイテム">
          <p class="___time___GHI789">1:00:00</p>
          <p class="___text___JKL012">
            <span class="___advertiser-name___MNO345">送り主<small class="___honorific___PQR678">さん</small></span>
          </p>
          <p class="___point___STU901">100 <small class="___point-unit___VWX234">pt</small></p>
        </li>
      </ul>`;
    const list = scrapeGiftHistoryList(document);
    const fromDom = scrapeGiftHistoryFromDom(document);
    expect(list.totalCount).toBe(1);
    expect(fromDom).not.toBeNull();
    expect(/** @type {any} */ (fromDom).length).toBe(1);
    expect(list.items[0].senderName).toBe(fromDom[0].advertiserName);
    expect(list.items[0].points).toBe(fromDom[0].point);
  });

  it('ギフト img が無い行も list / fromDom で一致して拾える', () => {
    document.body.innerHTML = `
      <ul class="gift-history-list">
        <li class="item">
          <p class="text"><span class="advertiser-name">x <small class="honorific">さん</small></span></p>
          <p class="point">42 <small class="point-unit">pt</small></p>
        </li>
        <li class="item">
          <img class="thumbnail" src="ok.png" alt="OK">
          <p class="time">0:01</p>
          <span class="advertiser-name">y <small class="honorific">さん</small></span>
          <p class="point">1 <small class="point-unit">pt</small></p>
        </li>
      </ul>`;
    const list = scrapeGiftHistoryList(document);
    const fromDom = scrapeGiftHistoryFromDom(document);
    expect(list.totalCount).toBe(2);
    expect(fromDom).not.toBeNull();
    expect(/** @type {any} */ (fromDom).length).toBe(2);
    expect(fromDom[0].advertiserName).toBe('x');
    expect(fromDom[1].advertiserName).toBe('y');
    expect(list.items[0].senderName).toBe('x');
    expect(list.items[1].senderName).toBe('y');
  });

  it('list 行から作った GiftHistoryEntry 束は aggregateGiftHistoryByUser と throws 集計が数値一致', () => {
    document.body.innerHTML = `
      <ul class="gift-history-list">
        <li class="item">
          <img class="thumbnail" src="a.png" alt="i1">
          <p class="time">0:01</p>
          <span class="advertiser-name">A<small class="honorific">さん</small></span>
          <p class="point">10 <small class="point-unit">pt</small></p>
        </li>
        <li class="item">
          <img class="thumbnail" src="b.png" alt="i2">
          <p class="time">0:02</p>
          <span class="advertiser-name">A<small class="honorific">さん</small></span>
          <p class="point">20 <small class="point-unit">pt</small></p>
        </li>
        <li class="item">
          <img class="thumbnail" src="c.png" alt="i3">
          <p class="time">0:03</p>
          <span class="advertiser-name">B<small class="honorific">さん</small></span>
          <p class="point">5 <small class="point-unit">pt</small></p>
        </li>
      </ul>`;
    const { items } = scrapeGiftHistoryList(document);
    const entries = listItemsToGiftHistoryEntries(items);
    const byUser = aggregateGiftHistoryByUser(entries);
    const throws = aggregateGiftHistoryThrows(items, NOW);
    const throwsByNick = new Map(throws.next.map((u) => [u.nickname, u]));
    for (const row of byUser) {
      const t = throwsByNick.get(row.name);
      expect(t).toBeDefined();
      expect(t.throwCount).toBe(row.giftCount);
      expect(t.totalPoints).toBe(row.totalPoints);
    }
  });
});

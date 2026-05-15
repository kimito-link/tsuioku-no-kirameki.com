/** @vitest-environment happy-dom */
/**
 * niconico ギフト sub-app の `gift-history-list` から個別ギフトを抽出する純関数のテスト。
 *
 * 2026-05-06 ユーザー提供の lv350468795 実 HTML 構造に基づいて確定。
 *   - ヘッダ + ナビ + 番組累計 + total-dold-count-list + gift-history-list の 5 段
 *   - gift-history-list は 60+ 件の li.item を持つ
 *
 * 既存の scrapeGiftHistoryFromDom（officialEventBannerDom.js）は「watch ページの top
 * document」を対象にしていた。本関数は「ギフト sub-app DOM」（iframe 内 / 同一 origin）を
 * 対象にし、popup 表示のために itemName / senderName / points を直接的なフィールド名で返す。
 */
import { describe, it, expect } from 'vitest';
import { scrapeGiftHistoryList } from './scrapeGiftHistoryList.js';

describe('scrapeGiftHistoryList', () => {
  it('空 DOM のとき items は空配列、totalCount は 0', () => {
    document.body.innerHTML = '';
    const r = scrapeGiftHistoryList(document);
    expect(r).toEqual({ items: [], totalCount: 0 });
  });

  it('null / undefined を渡しても落ちない', () => {
    expect(scrapeGiftHistoryList(null)).toEqual({ items: [], totalCount: 0 });
    expect(scrapeGiftHistoryList(undefined)).toEqual({ items: [], totalCount: 0 });
  });

  it('実 HTML 1 件抽出（itemName / senderName / points / time / thumbnailUrl）', () => {
    document.body.innerHTML = `
      <ul class="gift-history-list">
        <li class="item">
          <img class="thumbnail" src="https://example.com/decocome_kawaii_100.png" alt="かわいい×100">
          <p class="time">4:16:01</p>
          <p class="text">
            <span class="advertiser-name">quest <small class="honorific">さん</small></span>
          </p>
          <p class="point">9,000 <small class="point-unit">pt</small></p>
        </li>
      </ul>`;
    const r = scrapeGiftHistoryList(document);
    expect(r.totalCount).toBe(1);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].itemName).toBe('かわいい×100');
    expect(r.items[0].senderName).toBe('quest');
    expect(r.items[0].points).toBe(9000);
    expect(r.items[0].time).toBe('4:16:01');
    expect(r.items[0].thumbnailUrl).toContain('decocome_kawaii_100.png');
    expect(r.items[0].senderAvatarUrl).toBe('');
  });

  it('送り主の user icon（nicoaccount/usericon）が別 img であれば senderAvatarUrl に入る', () => {
    document.body.innerHTML = `
      <ul class="gift-history-list">
        <li class="item">
          <img src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/9/95239.jpg" alt="" class="face">
          <img class="thumbnail" src="https://example.com/gift.png" alt="ギフト名">
          <p class="time">4:16:01</p>
          <p class="text">
            <span class="advertiser-name">ネギトロ <small class="honorific">さん</small></span>
          </p>
          <p class="point">30 <small class="point-unit">pt</small></p>
        </li>
      </ul>`;
    const r = scrapeGiftHistoryList(document);
    expect(r.totalCount).toBe(1);
    expect(r.items[0].senderAvatarUrl).toContain('nicoaccount/usericon');
    expect(r.items[0].senderAvatarUrl).toContain('95239');
  });

  it('.thumbnail が class 名に含まれないギフト img でも行が取れる', () => {
    document.body.innerHTML = `
      <ul class="gift-history-list">
        <li class="item">
          <img src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/1.jpg" alt="">
          <img class="___gift-visual___XXX" src="https://cdn.example/gift-stamp.png" alt="わこつ茶">
          <p class="time">1:00</p>
          <span class="advertiser-name">仮名<small class="honorific">さん</small></span>
          <p class="point">50 <small class="point-unit">pt</small></p>
        </li>
      </ul>`;
    const r = scrapeGiftHistoryList(document);
    expect(r.totalCount).toBe(1);
    expect(r.items[0].points).toBe(50);
    expect(r.items[0].thumbnailUrl).toContain('gift-stamp.png');
    expect(r.items[0].senderAvatarUrl).toContain('usericon');
  });

  it('ギフト img が無く user icon のみでも送り主と pt は抽出', () => {
    document.body.innerHTML = `
      <ul class="gift-history-list">
        <li class="item">
          <img src="https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/1.jpg" alt="">
          <p class="time">2:00</p>
          <span class="advertiser-name">のみ子<small class="honorific">さん</small></span>
          <p class="point">10 <small class="point-unit">pt</small></p>
        </li>
      </ul>`;
    const r = scrapeGiftHistoryList(document);
    expect(r.totalCount).toBe(1);
    expect(r.items[0].senderName).toBe('のみ子');
    expect(r.items[0].points).toBe(10);
    expect(r.items[0].itemName).toBe('');
    expect(r.items[0].thumbnailUrl).toBe('');
    expect(r.items[0].senderAvatarUrl).toContain('usericon');
  });

  it('CSS Modules ハッシュ class（部分一致）でも抽出できる', () => {
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
    const r = scrapeGiftHistoryList(document);
    expect(r.totalCount).toBe(1);
    expect(r.items[0].itemName).toBe('アイテム');
    expect(r.items[0].senderName).toBe('送り主');
    expect(r.items[0].points).toBe(100);
  });

  it('「さん」を sender から除く（honorific は thumbnail / text どちらの構造でも）', () => {
    document.body.innerHTML = `
      <ul class="gift-history-list">
        <li class="item">
          <img class="thumbnail" src="x.png" alt="アイテム">
          <p class="time">0:01</p>
          <span class="advertiser-name">とうふ<small class="honorific">さん</small></span>
          <p class="point">500 <small class="point-unit">pt</small></p>
        </li>
      </ul>`;
    const r = scrapeGiftHistoryList(document);
    expect(r.items[0].senderName).toBe('とうふ');
    expect(r.items[0].senderName).not.toContain('さん');
  });

  it('comma 含む数値「9,000」を正しく parse、pointsRaw も保持', () => {
    document.body.innerHTML = `
      <ul class="gift-history-list">
        <li class="item">
          <img class="thumbnail" src="x.png" alt="アイテム">
          <p class="time">0:01</p>
          <span class="advertiser-name">u</span>
          <p class="point">9,000 <small class="point-unit">pt</small></p>
        </li>
      </ul>`;
    const r = scrapeGiftHistoryList(document);
    expect(r.items[0].points).toBe(9000);
    expect(r.items[0].pointsRaw).toBe('9,000');
  });

  it('複数件抽出（実データ相当 3 件）', () => {
    document.body.innerHTML = `
      <ul class="gift-history-list">
        <li class="item">
          <img class="thumbnail" src="a.png" alt="かわいい×100">
          <p class="time">4:16:01</p>
          <span class="advertiser-name">quest<small class="honorific">さん</small></span>
          <p class="point">9,000 <small class="point-unit">pt</small></p>
        </li>
        <li class="item">
          <img class="thumbnail" src="b.png" alt="100てん！">
          <p class="time">3:55:30</p>
          <span class="advertiser-name">とうふ<small class="honorific">さん</small></span>
          <p class="point">500 <small class="point-unit">pt</small></p>
        </li>
        <li class="item">
          <img class="thumbnail" src="c.png" alt="100てん！">
          <p class="time">3:50:10</p>
          <span class="advertiser-name">名無し<small class="honorific">さん</small></span>
          <p class="point">500 <small class="point-unit">pt</small></p>
        </li>
      </ul>`;
    const r = scrapeGiftHistoryList(document);
    expect(r.totalCount).toBe(3);
    expect(r.items.map((it) => it.senderName)).toEqual(['quest', 'とうふ', '名無し']);
    expect(r.items.map((it) => it.points)).toEqual([9000, 500, 500]);
    expect(r.items.map((it) => it.itemName)).toEqual(['かわいい×100', '100てん！', '100てん！']);
  });

  it('ギフト img が無くても送り主と point があれば拾う（送り主なしのみ skip）', () => {
    document.body.innerHTML = `
      <ul class="gift-history-list">
        <li class="item">
          <img class="thumbnail" src="ok.png" alt="正常">
          <p class="time">0:01</p>
          <span class="advertiser-name">u</span>
          <p class="point">100 <small class="point-unit">pt</small></p>
        </li>
        <li class="item">
          <p class="time">0:02</p>
          <span class="advertiser-name">no-img</span>
          <p class="point">200 <small class="point-unit">pt</small></p>
        </li>
        <li class="item">
          <img class="thumbnail" src="no-sender.png" alt="送り主なし">
          <p class="time">0:03</p>
          <p class="point">300 <small class="point-unit">pt</small></p>
        </li>
      </ul>`;
    const r = scrapeGiftHistoryList(document);
    expect(r.totalCount).toBe(2);
    expect(r.items[0].itemName).toBe('正常');
    expect(r.items[1].senderName).toBe('no-img');
    expect(r.items[1].points).toBe(200);
  });

  it('point に数字が無い場合は skip', () => {
    document.body.innerHTML = `
      <ul class="gift-history-list">
        <li class="item">
          <img class="thumbnail" src="x.png" alt="壊れたポイント">
          <p class="time">0:01</p>
          <span class="advertiser-name">u</span>
          <p class="point">  <small class="point-unit">pt</small></p>
        </li>
      </ul>`;
    const r = scrapeGiftHistoryList(document);
    expect(r.totalCount).toBe(0);
  });

  it('Element を root として渡しても document として渡しても等価', () => {
    document.body.innerHTML = `
      <div id="root">
        <ul class="gift-history-list">
          <li class="item">
            <img class="thumbnail" src="x.png" alt="A">
            <p class="time">0:01</p>
            <span class="advertiser-name">u</span>
            <p class="point">10 <small class="point-unit">pt</small></p>
          </li>
        </ul>
      </div>`;
    const docResult = scrapeGiftHistoryList(document);
    const rootEl = document.getElementById('root');
    const elemResult = scrapeGiftHistoryList(rootEl);
    expect(docResult.totalCount).toBe(1);
    expect(elemResult.totalCount).toBe(1);
    expect(docResult.items[0]).toEqual(elemResult.items[0]);
  });
});

/** @vitest-environment happy-dom */
/**
 * niconico ギフト sub-app の `total-dold-count-list` から種類別集計を抽出する純関数のテスト。
 *
 * 2026-05-06 ユーザー提供の lv350468795 実 HTML 構造に基づいて確定。
 *
 *   <ul class="total-dold-count-list">
 *     <li class="item">
 *       <img class="thumbnail" src=".../decocome_kawaii_100.png" alt="かわいい×100">
 *       × <strong class="count">1</strong>
 *     </li>
 *     ... 33 種類
 *   </ul>
 *
 * 「アイテム種類別の合計数」を popup に表示するため、シンプルに { itemName, thumbnailUrl, count }
 * の配列を返す。
 */
import { describe, it, expect } from 'vitest';
import { scrapeTotalGiftCountList } from './scrapeTotalGiftCountList.js';

describe('scrapeTotalGiftCountList', () => {
  it('空 DOM のとき items は空配列', () => {
    document.body.innerHTML = '';
    const r = scrapeTotalGiftCountList(document);
    expect(r).toEqual({ items: [] });
  });

  it('null / undefined を渡しても落ちない', () => {
    expect(scrapeTotalGiftCountList(null)).toEqual({ items: [] });
    expect(scrapeTotalGiftCountList(undefined)).toEqual({ items: [] });
  });

  it('実 HTML 1 件抽出（itemName / thumbnailUrl / count）', () => {
    document.body.innerHTML = `
      <ul class="total-dold-count-list">
        <li class="item">
          <img class="thumbnail" src="https://example.com/decocome_kawaii_100.png" alt="かわいい×100">
          × <strong class="count">1</strong>
        </li>
      </ul>`;
    const r = scrapeTotalGiftCountList(document);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].itemName).toBe('かわいい×100');
    expect(r.items[0].count).toBe(1);
    expect(r.items[0].thumbnailUrl).toContain('decocome_kawaii_100.png');
  });

  it('CSS Modules ハッシュ class（部分一致）でも抽出できる', () => {
    document.body.innerHTML = `
      <ul class="___total-dold-count-list___ABC123">
        <li class="___item___XYZ789">
          <img class="___thumbnail___DEF456" src="x.png" alt="アイテム">
          × <strong class="___count___GHI789">5</strong>
        </li>
      </ul>`;
    const r = scrapeTotalGiftCountList(document);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].itemName).toBe('アイテム');
    expect(r.items[0].count).toBe(5);
  });

  it('複数件抽出（実データ相当 3 種類）', () => {
    document.body.innerHTML = `
      <ul class="total-dold-count-list">
        <li class="item">
          <img class="thumbnail" src="a.png" alt="かわいい×100">
          × <strong class="count">1</strong>
        </li>
        <li class="item">
          <img class="thumbnail" src="b.png" alt="100てん！">
          × <strong class="count">11</strong>
        </li>
        <li class="item">
          <img class="thumbnail" src="c.png" alt="拍手">
          × <strong class="count">3</strong>
        </li>
      </ul>`;
    const r = scrapeTotalGiftCountList(document);
    expect(r.items).toHaveLength(3);
    expect(r.items.map((it) => it.itemName)).toEqual(['かわいい×100', '100てん！', '拍手']);
    expect(r.items.map((it) => it.count)).toEqual([1, 11, 3]);
  });

  it('count が 0 や数字以外の item は skip', () => {
    document.body.innerHTML = `
      <ul class="total-dold-count-list">
        <li class="item">
          <img class="thumbnail" src="a.png" alt="ok">
          × <strong class="count">2</strong>
        </li>
        <li class="item">
          <img class="thumbnail" src="b.png" alt="zero">
          × <strong class="count">0</strong>
        </li>
        <li class="item">
          <img class="thumbnail" src="c.png" alt="non-numeric">
          × <strong class="count">abc</strong>
        </li>
      </ul>`;
    const r = scrapeTotalGiftCountList(document);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].itemName).toBe('ok');
  });

  it('img や count が欠けた item は skip（防御）', () => {
    document.body.innerHTML = `
      <ul class="total-dold-count-list">
        <li class="item">
          <img class="thumbnail" src="ok.png" alt="正常">
          × <strong class="count">1</strong>
        </li>
        <li class="item">
          × <strong class="count">5</strong>
        </li>
        <li class="item">
          <img class="thumbnail" src="no-count.png" alt="count なし">
        </li>
      </ul>`;
    const r = scrapeTotalGiftCountList(document);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].itemName).toBe('正常');
  });

  it('itemName（alt 属性）が空の item は skip', () => {
    document.body.innerHTML = `
      <ul class="total-dold-count-list">
        <li class="item">
          <img class="thumbnail" src="x.png" alt="">
          × <strong class="count">1</strong>
        </li>
      </ul>`;
    const r = scrapeTotalGiftCountList(document);
    expect(r.items).toHaveLength(0);
  });

  it('comma 含む count（「11,000」相当）も parse', () => {
    document.body.innerHTML = `
      <ul class="total-dold-count-list">
        <li class="item">
          <img class="thumbnail" src="x.png" alt="多量">
          × <strong class="count">1,234</strong>
        </li>
      </ul>`;
    const r = scrapeTotalGiftCountList(document);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].count).toBe(1234);
  });

  it('Element を root として渡しても document として渡しても等価', () => {
    document.body.innerHTML = `
      <div id="root">
        <ul class="total-dold-count-list">
          <li class="item">
            <img class="thumbnail" src="x.png" alt="A">
            × <strong class="count">7</strong>
          </li>
        </ul>
      </div>`;
    const docResult = scrapeTotalGiftCountList(document);
    const rootEl = document.getElementById('root');
    const elemResult = scrapeTotalGiftCountList(rootEl);
    expect(docResult.items).toHaveLength(1);
    expect(elemResult.items).toHaveLength(1);
    expect(docResult.items[0]).toEqual(elemResult.items[0]);
  });
});

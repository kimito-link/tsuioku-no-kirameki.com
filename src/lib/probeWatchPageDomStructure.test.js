/** @vitest-environment happy-dom */
/**
 * v0.1.201: watch ページの主要 DOM 観測純関数のテスト。
 *
 * 既存 probeRecommendedLiveSection（おすすめ列）を補完する位置付けで、
 * 「ギフトサイドバー」「コメントテーブル」「動画 element」の存在状況を一気に
 * 診断 JSON に出すことで、popup の集計が「DOM があるのに取れていない」のか
 * 「そもそも DOM が見えていない」のかを切り分け可能にする。
 */

import { describe, it, expect } from 'vitest';
import { probeWatchPageDomStructure } from './probeWatchPageDomStructure.js';

/** @param {string} html @returns {Document} */
function buildDoc(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('probeWatchPageDomStructure', () => {
  it('null/undefined では全フラグ false の空 result を返す（壊れない）', () => {
    const r1 = probeWatchPageDomStructure(null);
    expect(r1.giftSidebar.iframeFound).toBe(false);
    expect(r1.giftSidebar.giftHistoryListPresent).toBe(false);
    expect(r1.giftSidebar.totalDoldCountListPresent).toBe(false);
    expect(r1.giftSidebar.advertiserNameCount).toBe(0);
    expect(r1.watchTab.commentTablePresent).toBe(false);
    expect(r1.watchTab.commentTableRowCount).toBe(0);
    expect(r1.watchTab.videoElementPresent).toBe(false);

    const r2 = probeWatchPageDomStructure(undefined);
    expect(r2).toEqual(r1);
  });

  it('giftSidebar: iframe + gift-history-list が見えれば true / 件数を出す', () => {
    const doc = buildDoc(`
      <html><body>
        <iframe src="about:blank"></iframe>
        <iframe class="gift-iframe"></iframe>
        <ul class="gift-history-list">
          <li class="item">
            <span class="advertiser-name">a</span>
          </li>
          <li class="item">
            <span class="advertiser-name">b</span>
          </li>
          <li class="item">
            <span class="advertiser-name">c</span>
          </li>
        </ul>
        <ul class="total-dold-count-list">
          <li class="item">x</li>
        </ul>
      </body></html>
    `);
    const r = probeWatchPageDomStructure(doc);
    expect(r.giftSidebar.iframeFound).toBe(true);
    expect(r.giftSidebar.giftHistoryListPresent).toBe(true);
    expect(r.giftSidebar.totalDoldCountListPresent).toBe(true);
    expect(r.giftSidebar.advertiserNameCount).toBe(3);
  });

  it('giftSidebar: CSS Modules ハッシュ命名（class*=）にも追随', () => {
    const doc = buildDoc(`
      <html><body>
        <ul class="___gift-history-list___HASH123 gift-history-list">
          <li class="item"><span class="advertiser-name">a</span></li>
        </ul>
      </body></html>
    `);
    const r = probeWatchPageDomStructure(doc);
    expect(r.giftSidebar.giftHistoryListPresent).toBe(true);
    expect(r.giftSidebar.advertiserNameCount).toBe(1);
  });

  it('watchTab: data-comment-type 属性の row を数える', () => {
    const doc = buildDoc(`
      <html><body>
        <table class="comment-table">
          <tr data-comment-type="normal"></tr>
          <tr data-comment-type="normal"></tr>
          <tr data-comment-type="emotion"></tr>
          <tr data-comment-type="gift"></tr>
        </table>
        <video></video>
      </body></html>
    `);
    const r = probeWatchPageDomStructure(doc);
    expect(r.watchTab.commentTablePresent).toBe(true);
    expect(r.watchTab.commentTableRowCount).toBe(4);
    expect(r.watchTab.videoElementPresent).toBe(true);
  });

  it('watchTab: data-comment-type 行が無くてもテーブルが見えていれば commentTablePresent=true', () => {
    const doc = buildDoc(`
      <html><body>
        <div class="comment-table"></div>
      </body></html>
    `);
    const r = probeWatchPageDomStructure(doc);
    expect(r.watchTab.commentTablePresent).toBe(true);
    expect(r.watchTab.commentTableRowCount).toBe(0);
  });

  it('giftSidebar / watchTab がどちらも空のページ（about:blank 等）でも false 系で安全に返す', () => {
    const doc = buildDoc('<html><body></body></html>');
    const r = probeWatchPageDomStructure(doc);
    expect(r.giftSidebar.iframeFound).toBe(false);
    expect(r.giftSidebar.giftHistoryListPresent).toBe(false);
    expect(r.watchTab.commentTablePresent).toBe(false);
    expect(r.watchTab.videoElementPresent).toBe(false);
  });

  it('querySelectorAll が throw する壊れた document でも crash しない', () => {
    const broken = /** @type {any} */ ({
      querySelector: () => { throw new Error('boom'); },
      querySelectorAll: () => { throw new Error('boom'); }
    });
    const r = probeWatchPageDomStructure(broken);
    // 落ちずに 0 で埋まる
    expect(r.giftSidebar.iframeFound).toBe(false);
    expect(r.watchTab.commentTablePresent).toBe(false);
    expect(r.watchTab.commentTableRowCount).toBe(0);
  });
});

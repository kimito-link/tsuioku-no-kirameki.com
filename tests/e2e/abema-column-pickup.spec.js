import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VENUE_PICKUP_CSS, venuePickupPlacement } from '../../src/lib/venuePickupBanner.js';

/**
 * ABEMA のコメント欄は約 250px。欄へ合わせて吹き出しを縮めると、本文が折れてニコ生・YouTube と違って見える。
 * ページが div を 40px・scale・zoom にしても、PICK UP は 320px 以上で、文字は 18px のまま。
 * 上段の最新コメントは欄の幅のまま。
 */

const COMMENT = 'そして今日も配信を見てくれてありがとう、いつも応援しています';
const NAME = 'D2AmVn58ed3nrb';
const popupHtml = readFileSync(fileURLToPath(new URL('../../extension/popup.html', import.meta.url)), 'utf8');

function cssRule(selectorLine) {
  const at = popupHtml.indexOf(selectorLine);
  if (at < 0) throw new Error(`popup.html に ${selectorLine} が無い`);
  const end = popupHtml.indexOf('\n      }', at);
  if (end < 0) throw new Error(`popup.html の ${selectorLine} が閉じていない`);
  return popupHtml.slice(at, end + '\n      }'.length);
}

const TICKER_CSS = [
  '      .nl-stats-bar {',
  '      .nl-stats-bar button.nl-count-hero--toggle {',
  '      .nl-stats-bar .nl-comment-ticker {',
  '      .nl-stats-bar .nl-support-timeline {',
  '      .nl-comment-ticker {',
  '      .nl-comment-ticker__viewport {',
  '      .nl-comment-ticker__scroll.is-latest-only {',
  '      .nl-comment-ticker__scroll.is-latest-only .nl-comment-ticker__seg {',
  '      .nl-comment-ticker__seg {',
  '      .nl-ticker-latest {',
  '      .nl-ticker-latest__row {',
  '      .nl-ticker-latest__avatar {',
  '      .nl-ticker-latest__name {',
  '      .nl-ticker-latest__colon {',
  '      .nl-ticker-latest__text {'
].map(cssRule).join('\n');

test('ABEMA の欄やホスト CSS で PICK UP は縮まず、上段は欄の幅のまま', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.setContent(`<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; background: #1a1d24; color: #111; font-family: "Hiragino Sans", "Noto Sans JP", sans-serif; }
  .layout { display: flex; gap: 16px; align-items: flex-start; padding: 16px; }
  .player { flex: 1 1 auto; height: 520px; background: #111; }
  .com-tv-CommentArea {
    position: relative;
    box-sizing: border-box;
    width: 250px !important;
    min-width: 250px !important;
    max-width: 250px !important;
    height: 520px;
    padding: 8px;
    background: #0e1116;
    color: #fff;
    overflow: hidden;
  }
  .com-tv-CommentBlock { margin: 8px 0; font-size: 13px; line-height: 1.4; color: #d7dde8; }
  .cap { font-size: 11px; color: #9aa4b5; margin: 0 0 6px; }
  .side {
    box-sizing: border-box;
    width: 250px;
    max-width: 250px;
    background: #f8fafc;
    border-radius: 12px;
    padding: 8px;
  }
  ${VENUE_PICKUP_CSS}
  ${TICKER_CSS}
</style>
<div class="layout">
  <div class="player"></div>
  <div class="abema-page">
    <p class="cap">ABEMA コメント欄 250px</p>
    <div class="nlsb-root">
      <div class="nlsb-pickup">
        <span class="nlsb-pickup__badge">PICK UP</span>
        <span class="nlsb-pickup__face" role="img" aria-label=""></span>
        <span class="nlsb-pickup__main">
          <span class="nlsb-pickup__meta">${NAME}</span>
          <span class="nlsb-pickup__body">${COMMENT}</span>
        </span>
      </div>
    </div>
    <div class="com-tv-CommentArea">
      <p class="com-tv-CommentBlock">先行のコメント</p>
      <p class="com-tv-CommentBlock">${COMMENT}</p>
    </div>
  </div>
  <div class="side">
    <p class="cap">サイドパネル上段</p>
    <div class="nl-stats-bar">
      <button type="button" class="nl-count-hero nl-count-hero--toggle">応援 21 コメント</button>
      <div class="nl-comment-ticker">
        <div class="nl-comment-ticker__viewport">
          <div class="nl-comment-ticker__scroll is-paused is-latest-only">
            <div class="nl-comment-ticker__seg">
              <span class="nl-ticker-item nl-ticker-latest">
                <span class="nl-ticker-latest__row">
                  <img class="nl-ticker-latest__avatar" alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">
                  <span class="nl-ticker-latest__name">${NAME}</span>
                  <span class="nl-ticker-latest__colon">：</span>
                  <span class="nl-ticker-latest__text">${COMMENT}</span>
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`);

  const column = page.locator('.com-tv-CommentArea');
  const bubble = page.locator('.nlsb-pickup');
  expect(venuePickupPlacement({ left: 900, top: 80, width: 274, height: 640 }, { left: 0, top: 0, width: 1280 })).toBeNull();

  const columnBox = await column.boundingBox();
  const bubbleBox = await bubble.boundingBox();
  expect(columnBox.width).toBeGreaterThanOrEqual(240);
  expect(columnBox.width).toBeLessThanOrEqual(260);
  expect(bubbleBox.width).toBeGreaterThanOrEqual(320);
  expect(bubbleBox.width).toBeGreaterThan(columnBox.width);

  const pickup = await page.evaluate(() => {
    const body = document.querySelector('.nlsb-pickup__body');
    const meta = document.querySelector('.nlsb-pickup__meta');
    const font = parseFloat(getComputedStyle(body).fontSize) || 16;
    const lines = [...body.getClientRects()].map((r) => r.width);
    return {
      bodyW: body.getBoundingClientRect().width,
      font,
      face: document.querySelector('.nlsb-pickup__face').getBoundingClientRect().width,
      cap: body.getBoundingClientRect().width / font,
      lines,
      metaW: meta.getBoundingClientRect().width,
      meta: meta.textContent,
      metaTop: meta.getBoundingClientRect().top,
      bodyTop: body.getBoundingClientRect().top
    };
  });
  expect(pickup.font).toBeGreaterThanOrEqual(16);
  expect(pickup.face).toBeGreaterThanOrEqual(40);
  expect(pickup.cap, `本文の幅 ${pickup.bodyW}px / ${pickup.font}px`).toBeGreaterThanOrEqual(16);
  expect(pickup.lines.length).toBe(1);
  expect(pickup.metaTop).toBeLessThan(pickup.bodyTop);
  for (const w of pickup.lines) expect(w).toBeGreaterThan(120);
  expect(pickup.metaW).toBeGreaterThan(48);
  expect(pickup.meta).toBe(NAME);

  const ticker = await page.evaluate(() => {
    const text = document.querySelector('.nl-ticker-latest__text');
    const name = document.querySelector('.nl-ticker-latest__name');
    const band = document.querySelector('.nl-comment-ticker');
    const font = parseFloat(getComputedStyle(text).fontSize) || 16;
    const lines = [...text.getClientRects()].map((r) => r.width);
    return {
      bandW: band.getBoundingClientRect().width,
      textW: text.getBoundingClientRect().width,
      font,
      cap: text.getBoundingClientRect().width / font,
      lines,
      nameW: name.getBoundingClientRect().width,
      nameTop: name.getBoundingClientRect().top,
      colonTop: document.querySelector('.nl-ticker-latest__colon').getBoundingClientRect().top
    };
  });
  expect(ticker.bandW).toBeGreaterThanOrEqual(200);
  expect(ticker.bandW).toBeLessThanOrEqual(250);
  expect(ticker.cap, `上段の幅 ${ticker.textW}px / ${ticker.font}px`).toBeGreaterThanOrEqual(16);
  expect(ticker.lines).toHaveLength(1);
  expect(ticker.lines[0]).toBeGreaterThan(120);
  expect(ticker.nameW).toBeGreaterThan(48);
  expect(Math.abs(ticker.nameTop - ticker.colonTop)).toBeLessThan(4);

  await column.screenshot({ path: 'test-results/abema-column-bubble.png' });
  await page.locator('.side').screenshot({ path: 'test-results/abema-column-ticker.png' });
});

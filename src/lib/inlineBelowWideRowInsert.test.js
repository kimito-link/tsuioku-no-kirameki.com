/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import {
  belowWideRowMaxParentHeightPx,
  computeBelowWideRowThresholdPx,
  findBelowWideRowInsertAfterElement
} from './inlineBelowWideRowInsert.js';

describe('computeBelowWideRowThresholdPx', () => {
  it('動画＋コメの union が閾値の主因になる', () => {
    const t = computeBelowWideRowThresholdPx(
      1920,
      { left: 100, top: 80, width: 820, height: 400 },
      { left: 960, top: 80, width: 860, height: 500 }
    );
    expect(t).toBeLessThanOrEqual(1920 - 24);
    expect(t).toBeGreaterThan(1000);
  });

  it('コメ矩形が無いときは動画幅とビューポート比で抑える', () => {
    const t = computeBelowWideRowThresholdPx(
      1400,
      { left: 40, top: 80, width: 720, height: 400 },
      null
    );
    expect(t).toBeLessThanOrEqual(1400 - 24);
    expect(t).toBeGreaterThanOrEqual(720);
  });
});

describe('belowWideRowMaxParentHeightPx', () => {
  it('ビューポートに応じて帯域を制限する', () => {
    expect(belowWideRowMaxParentHeightPx(1080)).toBeLessThanOrEqual(900);
    expect(belowWideRowMaxParentHeightPx(1080)).toBeGreaterThanOrEqual(480);
  });
});

describe('findBelowWideRowInsertAfterElement', () => {
  /** @param {HTMLElement} el @param {{left:number,top:number,width:number,height:number}} r */
  function stubRect(el, r) {
    const right = r.left + r.width;
    const bottom = r.top + r.height;
    el.getBoundingClientRect = () => ({
      x: r.left,
      y: r.top,
      width: r.width,
      height: r.height,
      top: r.top,
      left: r.left,
      right,
      bottom,
      toJSON() {
        return {};
      }
    });
  }

  it('grid 行の子に anchor があるとき、動画＋コメを含む行要素を返す', () => {
    document.body.innerHTML = `
      <div id="page" style="width:1200px;height:900px;">
        <div id="grid">
          <div id="cell1">
            <video id="v"></video>
            <div id="anchor">x</div>
          </div>
          <div id="cell2" class="ga-ns-comment-panel"></div>
        </div>
      </div>
    `;
    const page = document.getElementById('page');
    const grid = document.getElementById('grid');
    const cell1 = document.getElementById('cell1');
    const anchor = document.getElementById('anchor');
    const vid = document.getElementById('v');
    const panel = document.querySelector('.ga-ns-comment-panel');
    stubRect(/** @type {HTMLElement} */ (page), {
      left: 0,
      top: 0,
      width: 1200,
      height: 900
    });
    stubRect(/** @type {HTMLElement} */ (grid), {
      left: 0,
      top: 0,
      width: 1200,
      height: 420
    });
    stubRect(/** @type {HTMLElement} */ (cell1), {
      left: 0,
      top: 0,
      width: 780,
      height: 400
    });
    stubRect(/** @type {HTMLElement} */ (vid), {
      left: 40,
      top: 40,
      width: 720,
      height: 360
    });
    stubRect(/** @type {HTMLElement} */ (panel), {
      left: 800,
      top: 40,
      width: 380,
      height: 400
    });
    stubRect(/** @type {HTMLElement} */ (anchor), {
      left: 100,
      top: 320,
      width: 20,
      height: 20
    });
    expect(anchor && vid && panel && grid).toBeTruthy();
    const el = findBelowWideRowInsertAfterElement({
      domAnchor: /** @type {HTMLElement} */ (anchor),
      videoEl: /** @type {HTMLElement} */ (vid),
      commentPanel: panel,
      viewportInnerWidth: 1200,
      viewportInnerHeight: 900
    });
    expect(el?.id).toBe('grid');
  });

  it('狭い親しか無いときは null', () => {
    document.body.innerHTML = `
      <div id="narrow">
        <video id="v2"></video>
        <div id="a2"></div>
      </div>
    `;
    const narrow = document.getElementById('narrow');
    const anchor = document.getElementById('a2');
    const vid = document.getElementById('v2');
    stubRect(/** @type {HTMLElement} */ (narrow), {
      left: 0,
      top: 0,
      width: 400,
      height: 300
    });
    stubRect(/** @type {HTMLElement} */ (vid), {
      left: 10,
      top: 10,
      width: 380,
      height: 200
    });
    stubRect(/** @type {HTMLElement} */ (anchor), {
      left: 10,
      top: 220,
      width: 10,
      height: 10
    });
    const el = findBelowWideRowInsertAfterElement({
      domAnchor: /** @type {HTMLElement} */ (anchor),
      videoEl: /** @type {HTMLElement} */ (vid),
      commentPanel: null,
      viewportInnerWidth: 1200,
      viewportInnerHeight: 800
    });
    expect(el).toBeNull();
  });
});

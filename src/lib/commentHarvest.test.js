/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import {
  findNicoCommentPanel,
  findLargestVerticalScrollHost,
  findCommentListScrollHost,
  harvestVirtualCommentList
} from './commentHarvest.js';
import { extractCommentsFromNode } from './nicoliveDom.js';

describe('findNicoCommentPanel', () => {
  it('.ga-ns-comment-panel を優先', () => {
    document.body.innerHTML =
      '<div class="comment-panel"></div><div class="ga-ns-comment-panel" id="g"></div>';
    expect(findNicoCommentPanel(document)?.id).toBe('g');
  });

  it('.comment-panel のみでも取得（UI 世代差のフォールバック）', () => {
    document.body.innerHTML = '<div class="comment-panel" id="cp"></div>';
    expect(findNicoCommentPanel(document)?.id).toBe('cp');
  });
});

describe('findCommentListScrollHost', () => {
  it('.body[role=rowgroup] でスクロール可能ならそれを返す', () => {
    document.body.innerHTML = `
      <div class="ga-ns-comment-panel">
        <div class="body" role="rowgroup" style="height:40px;overflow:auto;width:200px">
          <div style="height:400px">tall</div>
        </div>
      </div>`;
    const h = document.querySelector('.body');
    Object.defineProperty(h, 'clientHeight', { value: 40, configurable: true });
    Object.defineProperty(h, 'scrollHeight', { value: 400, configurable: true });
    expect(findCommentListScrollHost(document)).toBe(h);
  });
});

describe('findLargestVerticalScrollHost', () => {
  it('子のうち最も縦にスクロールできる要素', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="a" style="height:30px;overflow:auto"><div style="height:100px"></div></div>
      <div class="b" style="height:30px;overflow:auto"><div style="height:300px"></div></div>`;
    document.body.appendChild(wrap);
    const a = wrap.querySelector('.a');
    const b = wrap.querySelector('.b');
    Object.defineProperty(a, 'clientHeight', { value: 30, configurable: true });
    Object.defineProperty(a, 'scrollHeight', { value: 100, configurable: true });
    Object.defineProperty(b, 'clientHeight', { value: 30, configurable: true });
    Object.defineProperty(b, 'scrollHeight', { value: 300, configurable: true });
    expect(findLargestVerticalScrollHost(wrap)).toBe(b);
  });
});

describe('harvestVirtualCommentList', () => {
  it('スクロールなしなら1回分の抽出', async () => {
    document.body.innerHTML = `
      <div class="ga-ns-comment-panel">
        <div class="body" role="rowgroup">
          <div class="table-row" data-comment-type="normal">
            <span class="comment-number">1</span><span class="comment-text">a</span>
          </div>
        </div>
      </div>`;
    const rows = await harvestVirtualCommentList({
      document,
      extractCommentsFromNode,
      waitMs: 0
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].commentNo).toBe('1');
  });

  it('スクロールホストありで位置ごとにマージ', async () => {
    document.body.innerHTML = `
      <div class="ga-ns-comment-panel">
        <div class="body" role="rowgroup" style="height:50px;overflow:auto;width:200px">
          <div id="slot"></div>
        </div>
      </div>`;
    const body = document.querySelector('.body');
    Object.defineProperty(body, 'clientHeight', { value: 50, configurable: true });
    Object.defineProperty(body, 'scrollHeight', { value: 500, configurable: true });
    let scrollTop = 0;
    Object.defineProperty(body, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (v) => {
        scrollTop = v;
      }
    });
    const slot = document.getElementById('slot');
    const extract = () => {
      const idx = Math.min(9, Math.max(0, Math.floor(scrollTop / 60)));
      slot.innerHTML = `
        <div class="table-row" data-comment-type="normal">
          <span class="comment-number">${idx + 1}</span>
          <span class="comment-text">x</span>
        </div>
        <div style="height:800px"></div>`;
      return extractCommentsFromNode(document.querySelector('.ga-ns-comment-panel'));
    };

    const rows = await harvestVirtualCommentList({
      document,
      extractCommentsFromNode: extract,
      waitMs: 0
    });
    const nos = new Set(rows.map((r) => r.commentNo));
    expect(nos.size).toBeGreaterThan(1);
  });
});

/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import {
  findNicoCommentPanel,
  findLargestVerticalScrollHost,
  findCommentListScrollHost,
  harvestVirtualCommentList,
  HARVEST_SCROLL_STEP_CLIENT_HEIGHT_RATIO,
  mergeVirtualHarvestRows,
  pageUserLikelyTypingIn
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

  it('いずれのセレクタにも合致しなければ null（改修検知の前提）', () => {
    document.body.innerHTML = '<div class="other-panel"></div>';
    expect(findNicoCommentPanel(document)).toBeNull();
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

describe('mergeVirtualHarvestRows', () => {
  it('後続で userId が空でも既存の userId を維持', () => {
    const m = mergeVirtualHarvestRows(
      { commentNo: '1', text: 'hi', userId: '12345678' },
      { commentNo: '1', text: 'hi', userId: null }
    );
    expect(m.userId).toBe('12345678');
  });

  it('後続に userId が付いたら採用', () => {
    const m = mergeVirtualHarvestRows(
      { commentNo: '1', text: 'hi', userId: null },
      { commentNo: '1', text: 'hi', userId: '87654321' }
    );
    expect(m.userId).toBe('87654321');
  });

  it('https avatarUrl を空で上書きしない', () => {
    const m = mergeVirtualHarvestRows(
      {
        commentNo: '1',
        text: 'a',
        userId: '1',
        avatarUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/12345.jpg'
      },
      { commentNo: '1', text: 'a', userId: null, avatarUrl: '' }
    );
    expect(m.avatarUrl).toMatch(/^https:\/\//);
  });

  it('nickname も空で上書きしない', () => {
    const m = mergeVirtualHarvestRows(
      { commentNo: '1', text: 'a', userId: '1', nickname: 'foo' },
      { commentNo: '1', text: 'a', userId: null, nickname: '' }
    );
    expect(m.nickname).toBe('foo');
  });
});

describe('pageUserLikelyTypingIn', () => {
  it('textarea フォーカスを検知', () => {
    document.body.innerHTML = '<textarea id="t"></textarea>';
    /** @type {HTMLTextAreaElement} */ (document.getElementById('t')).focus();
    expect(pageUserLikelyTypingIn(document)).toBe(true);
  });

  it('button フォーカスでは false', () => {
    document.body.innerHTML = '<button type="button" id="b">x</button>';
    /** @type {HTMLButtonElement} */ (document.getElementById('b')).focus();
    expect(pageUserLikelyTypingIn(document)).toBe(false);
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

  it('同一キーは薄い後続パスで userId を失わない', async () => {
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
    let extractCalls = 0;
    const extract = () => {
      extractCalls += 1;
      slot.innerHTML = `
        <div class="table-row" data-comment-type="normal">
          <span class="comment-number">5</span><span class="comment-text">same</span>
        </div>
        <div style="height:800px"></div>`;
      const base = extractCommentsFromNode(document.querySelector('.ga-ns-comment-panel'));
      const rich = extractCalls === 1;
      return base.map((r) =>
        r.commentNo === '5' && r.text === 'same'
          ? { ...r, userId: rich ? '99999111' : null }
          : r
      );
    };

    const rows = await harvestVirtualCommentList({
      document,
      extractCommentsFromNode: extract,
      waitMs: 0
    });
    const hit = rows.find((r) => r.commentNo === '5' && r.text === 'same');
    expect(hit?.userId).toBe('99999111');
  });

  it('入力フォーカス中はスクロール走査せず現在位置だけ抽出', async () => {
    document.body.innerHTML = `
      <div class="ga-ns-comment-panel">
        <div class="body" role="rowgroup" style="height:50px;overflow:auto;width:200px">
          <div id="slot"></div>
        </div>
      </div>
      <textarea id="composer"></textarea>`;
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
    let extractCalls = 0;
    const extract = () => {
      extractCalls += 1;
      slot.innerHTML = `
        <div class="table-row" data-comment-type="normal">
          <span class="comment-number">1</span><span class="comment-text">x</span>
        </div>
        <div style="height:800px"></div>`;
      return extractCommentsFromNode(document.querySelector('.ga-ns-comment-panel'));
    };
    /** @type {HTMLTextAreaElement} */ (document.getElementById('composer')).focus();
    await harvestVirtualCommentList({
      document,
      extractCommentsFromNode: extract,
      waitMs: 0
    });
    expect(extractCalls).toBe(1);
    expect(scrollTop).toBe(0);
  });

  it('respectTyping:false なら入力中でも仮想走査する', async () => {
    document.body.innerHTML = `
      <div class="ga-ns-comment-panel">
        <div class="body" role="rowgroup" style="height:50px;overflow:auto;width:200px">
          <div id="slot2"></div>
        </div>
      </div>
      <textarea id="composer2"></textarea>`;
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
    const slot = document.getElementById('slot2');
    let extractCalls = 0;
    const extract = () => {
      extractCalls += 1;
      const idx = Math.min(9, Math.max(0, Math.floor(scrollTop / 60)));
      slot.innerHTML = `
        <div class="table-row" data-comment-type="normal">
          <span class="comment-number">${idx + 1}</span>
          <span class="comment-text">x</span>
        </div>
        <div style="height:800px"></div>`;
      return extractCommentsFromNode(document.querySelector('.ga-ns-comment-panel'));
    };
    /** @type {HTMLTextAreaElement} */ (document.getElementById('composer2')).focus();
    await harvestVirtualCommentList({
      document,
      extractCommentsFromNode: extract,
      waitMs: 0,
      respectTyping: false
    });
    expect(extractCalls).toBeGreaterThan(2);
  });

  it('twoPass で第2パスが追加行をマージする', async () => {
    document.body.innerHTML = `
      <div class="ga-ns-comment-panel">
        <div class="body" role="rowgroup" style="height:50px;overflow:auto;width:200px">
          <div style="height:400px"></div>
        </div>
      </div>`;
    const body = document.querySelector('.body');
    Object.defineProperty(body, 'clientHeight', { value: 50, configurable: true });
    Object.defineProperty(body, 'scrollHeight', { value: 400, configurable: true });
    let scrollTop = 0;
    Object.defineProperty(body, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (v) => {
        scrollTop = v;
      }
    });
    let sweep = 0;
    const rows = await harvestVirtualCommentList({
      document,
      extractCommentsFromNode: () =>
        sweep === 0
          ? [{ commentNo: '1', text: 'a', userId: '11' }]
          : [
              { commentNo: '1', text: 'a', userId: '11' },
              { commentNo: '2', text: 'b', userId: '22' }
            ],
      waitMs: 0,
      twoPass: true,
      twoPassGapMs: 0,
      onBetweenVirtualPasses: () => {
        sweep = 1;
      }
    });
    const keys = new Set(rows.map((r) => `${r.commentNo}\t${r.text}`));
    expect(keys.has('1\ta')).toBe(true);
    expect(keys.has('2\tb')).toBe(true);
  });

  it('quietScroll でスクロールホストに opacity:0 を設定し終了後に復元', async () => {
    document.body.innerHTML = `
      <div class="ga-ns-comment-panel">
        <div class="body" role="rowgroup" style="height:50px;overflow:auto;width:200px">
          <div id="qs-slot"></div>
        </div>
      </div>`;
    const body = /** @type {HTMLElement} */ (document.querySelector('.body'));
    Object.defineProperty(body, 'clientHeight', { value: 50, configurable: true });
    Object.defineProperty(body, 'scrollHeight', { value: 500, configurable: true });
    let scrollTop = 0;
    Object.defineProperty(body, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (v) => { scrollTop = v; }
    });
    body.style.opacity = '1';

    let opacityDuringExtract = '';
    const slot = document.getElementById('qs-slot');
    const extract = () => {
      opacityDuringExtract = body.style.opacity;
      const idx = Math.min(9, Math.max(0, Math.floor(scrollTop / 60)));
      slot.innerHTML = `
        <div class="table-row" data-comment-type="normal">
          <span class="comment-number">${idx + 1}</span>
          <span class="comment-text">qs</span>
        </div>
        <div style="height:800px"></div>`;
      return extractCommentsFromNode(document.querySelector('.ga-ns-comment-panel'));
    };

    const rows = await harvestVirtualCommentList({
      document,
      extractCommentsFromNode: extract,
      waitMs: 0,
      quietScroll: true
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(opacityDuringExtract).toBe('0');
    expect(body.style.opacity).toBe('1');
  });

  it('HARVEST_SCROLL_STEP_CLIENT_HEIGHT_RATIO は取りこぼし対策で 0.72 未満', () => {
    expect(HARVEST_SCROLL_STEP_CLIENT_HEIGHT_RATIO).toBeLessThan(0.72);
    expect(HARVEST_SCROLL_STEP_CLIENT_HEIGHT_RATIO).toBeGreaterThan(0.4);
  });
});

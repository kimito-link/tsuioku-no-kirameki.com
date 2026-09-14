/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wireLaneUserDetailOpen } from './wireLaneUserDetailOpen.js';

/**
 * 応援レーンのタイル click → comeview 発言一覧を開く配線(DESIGN 機能A・A3)の回帰。
 * DOM(委譲・修飾キー素通し・二重配線ガード)を happy-dom で固定する。
 * 純粋なパス/対象判定は comeviewUserDetailLink.test.js が別途固める。
 *
 * ★各テストは document.implementation.createHTMLDocument() で独立した document を作る。
 *   happy-dom は同一 document を共有するため、共用すると前テストで張った click listener が
 *   残って件数が累積する(テスト同士の汚染)。新 document なら listener もまっさらになる。
 */
describe('wireLaneUserDetailOpen', () => {
  let created;
  let doc;

  beforeEach(() => {
    created = [];
    globalThis.chrome = {
      runtime: { getURL: (p) => `chrome-extension://ID/${p}` },
      windows: {
        create: vi.fn((opts) => {
          created.push(opts);
          return Promise.resolve({});
        })
      }
    };
    doc = document.implementation.createHTMLDocument('t');
  });

  afterEach(() => {
    delete globalThis.chrome;
  });

  /** click イベントを1個作る(happy-dom の window.MouseEvent を使う) */
  function clickEvent(extra = {}) {
    return new window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
      ...extra
    });
  }

  /** クリック可能なタイルを1つ作って doc.body に入れる */
  function addTile({ userKey, title, tag = 'a' }) {
    const cell = doc.createElement(tag);
    cell.className = 'nl-story-userlane-cell';
    if (userKey != null) cell.setAttribute('data-user-key', userKey);
    if (title != null) cell.setAttribute('title', title);
    const img = doc.createElement('img');
    cell.appendChild(img);
    doc.body.appendChild(cell);
    return { cell, img };
  }

  it('数値 uid タイルの素クリックで comeview を popup 窓で開き既定動作を止める', () => {
    const { cell } = addTile({ userKey: 'u:123', title: 'みち | 123' });
    wireLaneUserDetailOpen(doc);
    const ev = clickEvent();
    cell.dispatchEvent(ev);
    expect(created).toHaveLength(1);
    expect(created[0].url).toBe('chrome-extension://ID/comeview.html?user=123&uname=%E3%81%BF%E3%81%A1');
    expect(ev.defaultPrevented).toBe(true);
  });

  it('タイル内の子要素(img)クリックでも closest で拾う', () => {
    const { img } = addTile({ userKey: 'u:456', title: 'ほし | 456' });
    wireLaneUserDetailOpen(doc);
    img.dispatchEvent(clickEvent());
    expect(created).toHaveLength(1);
    expect(created[0].url).toContain('user=456');
  });

  it('匿名タイル(u:a:xyz・span)もクリックで開ける', () => {
    const { cell } = addTile({ userKey: 'u:a:xyz', title: '匿名12', tag: 'span' });
    wireLaneUserDetailOpen(doc);
    cell.dispatchEvent(clickEvent());
    expect(created).toHaveLength(1);
    expect(created[0].url).toContain('user=a%3Axyz');
  });

  it('Ctrl+クリックは素通し(既定動作=ユーザーページを止めない)', () => {
    const { cell } = addTile({ userKey: 'u:123', title: 'みち | 123' });
    wireLaneUserDetailOpen(doc);
    const ev = clickEvent({ ctrlKey: true });
    cell.dispatchEvent(ev);
    expect(created).toHaveLength(0);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('中ボタン(button=1)は素通し', () => {
    const { cell } = addTile({ userKey: 'u:123', title: 'みち | 123' });
    wireLaneUserDetailOpen(doc);
    cell.dispatchEvent(clickEvent({ button: 1 }));
    expect(created).toHaveLength(0);
  });

  it('c: 始まり(広告主等 uid 無し)は何もしない', () => {
    const { cell } = addTile({ userKey: 'c:idline|title', title: 'x', tag: 'span' });
    wireLaneUserDetailOpen(doc);
    cell.dispatchEvent(clickEvent());
    expect(created).toHaveLength(0);
  });

  it('二重配線しない(2回呼んでも click 1回で1回だけ開く)', () => {
    const { cell } = addTile({ userKey: 'u:123', title: 'みち | 123' });
    wireLaneUserDetailOpen(doc);
    wireLaneUserDetailOpen(doc);
    cell.dispatchEvent(clickEvent());
    expect(created).toHaveLength(1);
  });

  it('root が無くても落ちない', () => {
    expect(() => wireLaneUserDetailOpen(null)).not.toThrow();
  });
});

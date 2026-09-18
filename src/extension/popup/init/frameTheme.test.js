/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyPopupFrameFallback,
  loadPopupFrameSettings,
  popupFrameState,
  wireFrameTheme
} from './frameTheme.js';

/**
 * ★refactor Phase 4 Track B の 4-1(枠テーマ)の回帰。
 *
 * 抽出前は popup-entry 内の initPopup クロージャ/私有関数で呼び出せず、テストが無かった。
 * 切り出したことで「要素が無くても落ちない」「保存に storage が呼ばれる」
 * 「共有コードの往復で state が更新される」を初めて機械で固定できる。
 */

/** getEl 用の簡易 DOM レジストリを作る。 */
function makeDom() {
  const els = new Map();
  const mk = (id, tag = 'div') => {
    const el = document.createElement(tag);
    el.id = id;
    els.set(id, el);
    document.body.appendChild(el);
    return el;
  };
  return { els, mk, getEl: (id) => els.get(id) || null, doc: document };
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('style');
  // chrome.storage.local をスタブ。
  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => {})
      }
    }
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('wireFrameTheme(抽出後も同じ挙動)', () => {
  it('★対象要素が無くても落ちない', () => {
    const dom = makeDom();
    expect(() =>
      wireFrameTheme({
        getEl: dom.getEl,
        doc: dom.doc,
        copyTextToClipboard: async () => true,
        triggerOpSound: () => {}
      })
    ).not.toThrow();
  });

  it('★カスタム保存ボタンで id=custom になり storage.set が呼ばれる', () => {
    const dom = makeDom();
    dom.mk('saveCustomFrame', 'button');
    dom.mk('frameHeaderStart', 'input');
    dom.mk('frameHeaderEnd', 'input');
    dom.mk('frameAccent', 'input');
    wireFrameTheme({
      getEl: dom.getEl,
      doc: dom.doc,
      copyTextToClipboard: async () => true,
      triggerOpSound: () => {}
    });
    dom.getEl('saveCustomFrame').dispatchEvent(new Event('click'));
    expect(popupFrameState.id).toBe('custom');
    expect(chrome.storage.local.set).toHaveBeenCalled();
  });

  it('★共有コードのコピーで copyTextToClipboard と triggerOpSound(op_copy) が呼ばれる', async () => {
    const dom = makeDom();
    dom.mk('copyFrameCode', 'button');
    dom.mk('frameShareStatus');
    const copy = vi.fn(async () => true);
    const sound = vi.fn();
    wireFrameTheme({
      getEl: dom.getEl,
      doc: dom.doc,
      copyTextToClipboard: copy,
      triggerOpSound: sound
    });
    dom.getEl('copyFrameCode').dispatchEvent(new Event('click'));
    await Promise.resolve();
    await Promise.resolve();
    expect(copy).toHaveBeenCalledTimes(1);
    expect(sound).toHaveBeenCalledWith('op_copy');
  });

  it('★共有コードのトグルで frameShareBox の hidden が反転する', () => {
    const dom = makeDom();
    dom.mk('toggleFrameCodeInput', 'button');
    const box = dom.mk('frameShareBox');
    box.hidden = true;
    dom.mk('frameShareCode', 'textarea');
    dom.mk('frameShareStatus');
    wireFrameTheme({
      getEl: dom.getEl,
      doc: dom.doc,
      copyTextToClipboard: async () => true,
      triggerOpSound: () => {}
    });
    dom.getEl('toggleFrameCodeInput').dispatchEvent(new Event('click'));
    expect(box.hidden).toBe(false);
  });
});

describe('loadPopupFrameSettings / applyPopupFrameFallback', () => {
  it('★storage が空なら既定枠を適用しても落ちない', async () => {
    const dom = makeDom();
    dom.mk('frameCurrentLabel');
    await expect(loadPopupFrameSettings(dom.getEl, dom.doc)).resolves.toBeUndefined();
  });

  it('★フォールバックは現状値で塗るだけ(落ちない)', () => {
    const dom = makeDom();
    dom.mk('frameCurrentLabel');
    expect(() => applyPopupFrameFallback(dom.getEl, dom.doc)).not.toThrow();
  });

  it('★storage の値を読んで popupFrameState に反映する', async () => {
    const dom = makeDom();
    dom.mk('frameCurrentLabel');
    chrome.storage.local.get = vi.fn(async () => ({ popupFrame: 'custom' }));
    await loadPopupFrameSettings(dom.getEl, dom.doc);
    expect(popupFrameState.id).toBe('custom');
  });
});

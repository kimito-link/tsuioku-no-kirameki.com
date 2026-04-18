import { describe, it, expect } from 'vitest';
import {
  INLINE_HOST_RESETTABLE_STYLE_PROPERTIES,
  INLINE_HOST_PLACEMENT_CLASSES,
  applyInlineHostPlacementReset
} from './inlineHostLayoutReset.js';

/** 最小 mock: HTMLElement の classList.remove / style プロパティ書き換え / removeAttribute だけ満たす */
function makeHostMock(initial = {}) {
  const classes = new Set(initial.classes || []);
  const style = { ...(initial.style || {}) };
  const attrs = new Set(initial.attrs || []);
  return {
    classList: {
      remove: (name) => classes.delete(name),
      has: (name) => classes.has(name),
      _dump: () => Array.from(classes)
    },
    style,
    removeAttribute: (name) => attrs.delete(name),
    hasAttribute: (name) => attrs.has(name),
    _attrsDump: () => Array.from(attrs)
  };
}

describe('INLINE_HOST_RESETTABLE_STYLE_PROPERTIES', () => {
  it('floating / dock_bottom が付ける placement 系スタイルを網羅する', () => {
    /* renderInlinePanelFloatingHost / renderInlinePanelDockBottomHost が
     * 直接書き込むプロパティをすべて含むことを確認（将来追加時の漏れ検知）。 */
    const must = [
      'position',
      'top',
      'right',
      'left',
      'bottom',
      'width',
      'maxWidth',
      'maxHeight',
      'marginLeft',
      'boxSizing',
      'overflow',
      'overflowX',
      'boxShadow',
      'borderRadius',
      'background',
      'zIndex'
    ];
    for (const p of must) {
      expect(INLINE_HOST_RESETTABLE_STYLE_PROPERTIES).toContain(p);
    }
  });

  it('visibility state（display / opacity / pointerEvents）は含まない', () => {
    /* これらは ensureInlinePopupHost() が display:none で panel を初期非表示にする
     * 正本 state であり、placement reset で剥がしてはいけない（panel が勝手に
     * 可視化される「こん太を押す前から panel がいきなり出る」症状の原因）。 */
    expect(INLINE_HOST_RESETTABLE_STYLE_PROPERTIES).not.toContain('display');
    expect(INLINE_HOST_RESETTABLE_STYLE_PROPERTIES).not.toContain('opacity');
    expect(INLINE_HOST_RESETTABLE_STYLE_PROPERTIES).not.toContain(
      'pointerEvents'
    );
  });

  it('placement クラスは floating / dock-bottom の 2 種のみ', () => {
    expect(INLINE_HOST_PLACEMENT_CLASSES).toEqual([
      'nls-inline-host--floating',
      'nls-inline-host--dock-bottom'
    ]);
  });
});

describe('applyInlineHostPlacementReset', () => {
  it('null / undefined を安全に無視する', () => {
    expect(() => applyInlineHostPlacementReset(null)).not.toThrow();
    expect(() => applyInlineHostPlacementReset(undefined)).not.toThrow();
  });

  it('floating モードの残留スタイルをすべて空文字にする', () => {
    const host = makeHostMock({
      classes: ['nls-inline-host--floating'],
      style: {
        position: 'fixed',
        top: '12px',
        right: '12px',
        width: '420px',
        maxWidth: '420px',
        maxHeight: '600px',
        marginLeft: '0',
        boxSizing: 'border-box',
        zIndex: '2147483646',
        boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
        borderRadius: '14px',
        background: 'transparent',
        // 以下は visibility 系（reset では触らない想定）
        display: 'block',
        opacity: '1',
        pointerEvents: 'auto'
      },
      attrs: ['aria-hidden']
    });
    applyInlineHostPlacementReset(host);
    expect(host.classList.has('nls-inline-host--floating')).toBe(false);
    for (const prop of INLINE_HOST_RESETTABLE_STYLE_PROPERTIES) {
      expect(host.style[prop]).toBe('');
    }
    // visibility state は reset 対象外 → render 側が書いた値を保持
    expect(host.style.display).toBe('block');
    expect(host.style.opacity).toBe('1');
    expect(host.style.pointerEvents).toBe('auto');
    expect(host.hasAttribute('aria-hidden')).toBe(true);
  });

  it('初期非表示（display:none + aria-hidden:true）を剥がさない（回帰ガード）', () => {
    /* ensureInlinePopupHost() が新規作成時に設定する初期の非表示 state を
     * placement reset で勝手に可視化しない。ユーザーがこん太を押していない段階で
     * panel がページ上にいきなり展開表示される症状（Bug #3 派生）の再発防止。 */
    const host = makeHostMock({
      style: {
        display: 'none',
        pointerEvents: 'auto',
        width: '100%'
      },
      attrs: ['aria-hidden']
    });
    applyInlineHostPlacementReset(host);
    expect(host.style.display).toBe('none');
    expect(host.hasAttribute('aria-hidden')).toBe(true);
    // width は placement 系なので空になってよい（render が再設定する）
    expect(host.style.width).toBe('');
  });

  it('dock_bottom モードの残留（width=100% / marginLeft=0 等）も空文字にする', () => {
    const host = makeHostMock({
      classes: ['nls-inline-host--dock-bottom'],
      style: {
        position: 'fixed',
        left: '0',
        right: '0',
        bottom: 'env(safe-area-inset-bottom, 0px)',
        width: '100%',
        maxWidth: '100%',
        maxHeight: '480px',
        marginLeft: '0',
        boxSizing: 'border-box',
        borderRadius: '14px 14px 0 0'
      }
    });
    applyInlineHostPlacementReset(host);
    expect(host.classList.has('nls-inline-host--dock-bottom')).toBe(false);
    expect(host.style.width).toBe('');
    expect(host.style.maxWidth).toBe('');
    expect(host.style.marginLeft).toBe('');
    expect(host.style.boxSizing).toBe('');
    expect(host.style.borderRadius).toBe('');
  });

  it('below/beside 由来の marginLeft / width もまとめて消える（回帰ガード）', () => {
    const host = makeHostMock({
      style: {
        marginLeft: '240px', // プレイヤー列基準の横オフセット
        width: '560px'
      }
    });
    applyInlineHostPlacementReset(host);
    expect(host.style.marginLeft).toBe('');
    expect(host.style.width).toBe('');
  });
});

import { describe, it, expect } from 'vitest';
import { readInlineModeFlags } from './inlineModeFlags.js';

/**
 * popup 起動モードフラグの純関数。popup-entry.js の 5 IIFE(INLINE_MODE/TOOLBAR_POPUP/INLINE_EMBED_WATCH/
 * INLINE_SIDE_PANEL/INLINE_PASSIVE)から抽出した判定を固定する(挙動不変の characterization)。
 */

describe('readInlineModeFlags', () => {
  it('空/未指定は全 false', () => {
    expect(readInlineModeFlags('')).toEqual({
      inline: false, toolbar: false, embedWatch: false, sidePanel: false, passive: false
    });
    expect(readInlineModeFlags(undefined)).toEqual({
      inline: false, toolbar: false, embedWatch: false, sidePanel: false, passive: false
    });
  });

  it('?inline=1 単独 = inline + embedWatch(dock 未指定は sidepanel でない)', () => {
    const f = readInlineModeFlags('?inline=1');
    expect(f.inline).toBe(true);
    expect(f.embedWatch).toBe(true); // dock!=='sidepanel'
    expect(f.sidePanel).toBe(false);
    expect(f.passive).toBe(false);
  });

  it('?inline=1&dock=status = passive(受動ビュー)。embedWatch も true(自タブ lv 解決のため)', () => {
    const f = readInlineModeFlags('?inline=1&dock=status');
    expect(f.passive).toBe(true);
    expect(f.embedWatch).toBe(true); // dock!=='sidepanel' なので &lv= 解決経路は生きる
    expect(f.sidePanel).toBe(false);
  });

  it('?inline=1&dock=sidepanel = sidePanel。embedWatch/passive は false', () => {
    const f = readInlineModeFlags('?inline=1&dock=sidepanel');
    expect(f.sidePanel).toBe(true);
    expect(f.embedWatch).toBe(false);
    expect(f.passive).toBe(false);
  });

  it('dock=status でも inline=1 が無ければ passive は false(受動は inline 前提)', () => {
    const f = readInlineModeFlags('?dock=status');
    expect(f.inline).toBe(false);
    expect(f.passive).toBe(false);
    expect(f.embedWatch).toBe(false);
  });

  it('?toolbar=1 = toolbar(inline 系は全 false)', () => {
    const f = readInlineModeFlags('?toolbar=1');
    expect(f.toolbar).toBe(true);
    expect(f.inline).toBe(false);
    expect(f.passive).toBe(false);
  });

  it('? 無しの素のクエリ文字列でも読める', () => {
    expect(readInlineModeFlags('inline=1&dock=status').passive).toBe(true);
  });
});

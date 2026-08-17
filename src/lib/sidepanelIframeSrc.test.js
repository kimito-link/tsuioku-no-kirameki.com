import { describe, it, expect } from 'vitest';
import { buildSidePanelIframeSrc, readSidePanelLv } from './sidepanelIframeSrc.js';

const BASE = 'popup.html?inline=1&dock=sidepanel';

/**
 * ★v0.1.1419: 実機(2026-08-17)の「レーンが空・描画関数が一度も呼ばれていません」の真因。
 *   background.js は sidepanel.html?lv=lv351195145 と正しく渡していたのに、
 *   iframe src が静的で lv を持たず【境界で捨てられていた】。
 */
describe('readSidePanelLv', () => {
  it('★実機の値を取り出せる', () => {
    expect(readSidePanelLv('?lv=lv351195145')).toBe('lv351195145');
  });

  it('? が無くても読める', () => {
    expect(readSidePanelLv('lv=lv123')).toBe('lv123');
  });

  it('大文字は小文字へ正規化する', () => {
    expect(readSidePanelLv('?lv=LV123')).toBe('lv123');
  });

  it('★不正な lv は通さない(付けるくらいなら無いほうが安全)', () => {
    expect(readSidePanelLv('?lv=abc')).toBe('');
    expect(readSidePanelLv('?lv=123')).toBe('');       // lv 接頭辞なし
    expect(readSidePanelLv('?lv=lv')).toBe('');        // 数字なし
    expect(readSidePanelLv('?lv=lv12345678901234567')).toBe(''); // 桁あふれ(16桁)
    expect(readSidePanelLv('')).toBe('');
    expect(readSidePanelLv(null)).toBe('');
  });
});

describe('buildSidePanelIframeSrc', () => {
  it('★lv があれば足す(これが無いとレーンが永久に空)', () => {
    expect(buildSidePanelIframeSrc(BASE, '?lv=lv351195145')).toBe(
      'popup.html?inline=1&dock=sidepanel&lv=lv351195145'
    );
  });

  it('lv が無ければ素の src のまま(従来挙動を変えない)', () => {
    expect(buildSidePanelIframeSrc(BASE, '')).toBe(BASE);
    expect(buildSidePanelIframeSrc(BASE, '?lv=abc')).toBe(BASE);
  });

  it('★既存クエリ(inline/dock)を壊さない', () => {
    const out = buildSidePanelIframeSrc(BASE, '?lv=lv999');
    expect(out).toContain('inline=1');
    expect(out).toContain('dock=sidepanel');
    expect(out).toContain('lv=lv999');
  });

  it('★冪等: 既に lv があれば二重に足さない', () => {
    const once = buildSidePanelIframeSrc(BASE, '?lv=lv999');
    expect(buildSidePanelIframeSrc(once, '?lv=lv999')).toBe(once);
  });

  it('? を持たない base でも正しく繋ぐ', () => {
    expect(buildSidePanelIframeSrc('popup.html', '?lv=lv1')).toBe('popup.html?lv=lv1');
  });

  it('空入力でも落ちない', () => {
    expect(buildSidePanelIframeSrc('', '?lv=lv1')).toBe('');
    expect(buildSidePanelIframeSrc(null, null)).toBe('');
  });

  it('★popup 側の判定(readInlineModeFlags)が sidePanel のままであること', () => {
    // lv を足しても dock=sidepanel は保たれる=モード判定は変わらない。
    const out = buildSidePanelIframeSrc(BASE, '?lv=lv351195145');
    const q = new URLSearchParams(out.split('?')[1]);
    expect(q.get('inline')).toBe('1');
    expect(q.get('dock')).toBe('sidepanel');
    expect(q.get('lv')).toBe('lv351195145');
  });
});

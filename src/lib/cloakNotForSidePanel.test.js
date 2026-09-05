import { describe, it, expect } from 'vitest';
import { shouldUseCloak } from './cloakNotForSidePanel.js';

/**
 * ★v0.1.1420: サイドパネルでは幕(cloak)を使わない。
 *
 * ユーザー証言「サイドパネルをはじめていれた時はでなかった」＋ git log で確定:
 *   導入時(795c41b3)は幕なし → 黒くない
 *   v0.1.1279(997f07f1)で幕を静的に追加 → ここから「真っ黒」
 * 以後12版「黒を消す工夫」を足したが消えなかった。作っている当人を外す。
 */
describe('shouldUseCloak', () => {
  it('★サイドパネルでは幕を使わない(黒の発生源を断つ)', () => {
    expect(shouldUseCloak('?inline=1&dock=sidepanel')).toBe(false);
    expect(shouldUseCloak('?inline=1&dock=sidepanel&lv=lv123')).toBe(false);
    // 順序が違っても効く
    expect(shouldUseCloak('?dock=sidepanel&inline=1')).toBe(false);
  });

  it('★watch 埋め込みでは従来どおり幕を使う(ちらつき隠しに意味がある)', () => {
    expect(shouldUseCloak('?inline=1&lv=lv123')).toBe(true);
    expect(shouldUseCloak('?inline=1&dock=embed')).toBe(true);
  });

  it('別窓 popup / ツールバーでも従来どおり', () => {
    expect(shouldUseCloak('')).toBe(true);
    expect(shouldUseCloak('?toolbar=1')).toBe(true);
  });

  it('status / liveview 埋め込みは従来どおり(サイドパネルではない)', () => {
    expect(shouldUseCloak('?inline=1&dock=status')).toBe(true);
    expect(shouldUseCloak('?inline=1&dock=liveview')).toBe(true);
  });

  it('★inline=1 が無ければ dock だけでは sidepanel と見なさない(規約を揃える)', () => {
    // readInlineModeFlags の sidePanel は `inline && dock==='sidepanel'`。
    // 片方だけで判定すると、あちらと食い違う穴になる。
    expect(shouldUseCloak('?dock=sidepanel')).toBe(true);
  });

  it('★判定できないときは幕を使う=安全側(挙動を変えない)', () => {
    expect(shouldUseCloak(null)).toBe(true);
    expect(shouldUseCloak(undefined)).toBe(true);
  });
});

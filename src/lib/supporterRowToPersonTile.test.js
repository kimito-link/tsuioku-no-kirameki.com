import { describe, it, expect } from 'vitest';
import { supporterRowToPersonTile } from './supporterRowToPersonTile.js';

// 注入 io のフェイク(呼ばれ方と分岐を観測する)。
function makeIo(overrides = {}) {
  return {
    deriveAvatarUrlFromUid: (uid) => (/^\d{5,14}$/.test(String(uid)) ? `https://thumb/${uid}.jpg` : ''),
    anonymousIdenticonDataUrl: (uid) => `data:image/svg+xml;base64,IDENTICON(${uid})`,
    storyUserLaneMetaLines: (entry) => ({
      idLine: entry.userId || '—',
      nameLine: entry.nickname || '匿名'
    }),
    ...overrides
  };
}

describe('supporterRowToPersonTile', () => {
  it('avatarUrl があればそれを最優先で displaySrc に使う(①)', () => {
    const row = { rank: 1, userId: '12345', name: 'みやび', avatarUrl: 'https://real/a.jpg', count: 9, isAnonymous: false };
    const t = supporterRowToPersonTile(row, makeIo());
    expect(t.displaySrc).toBe('https://real/a.jpg');
  });

  it('avatarUrl 無し+数値uid なら公式サムネを導出(②)', () => {
    const row = { rank: 2, userId: '6789012', name: 'たろう', avatarUrl: '', count: 4, isAnonymous: false };
    const t = supporterRowToPersonTile(row, makeIo());
    expect(t.displaySrc).toBe('https://thumb/6789012.jpg');
  });

  it('avatarUrl 無し+匿名(数値でない)なら identicon にフォールバック(③・一律グレー化しない)', () => {
    const row = { rank: 3, userId: 'a:abc123', name: '', avatarUrl: '', count: 2, isAnonymous: true };
    const t = supporterRowToPersonTile(row, makeIo());
    expect(t.displaySrc).toContain('data:image/svg+xml');
    expect(t.displaySrc).toContain('IDENTICON(a:abc123)');
  });

  it('entry.userId を素直に渡す(リンク可否は buildPersonTileEl 側が判定)', () => {
    const row = { rank: 1, userId: '12345', name: 'x', avatarUrl: '', count: 1, isAnonymous: false };
    expect(supporterRowToPersonTile(row, makeIo()).entry.userId).toBe('12345');
  });

  it('meta は storyUserLaneMetaLines(正本)に委譲する', () => {
    const row = { rank: 1, userId: '12345', name: 'みやび', avatarUrl: 'https://real/a.jpg', count: 9, isAnonymous: false };
    const t = supporterRowToPersonTile(row, makeIo());
    expect(t.meta).toEqual({ idLine: '12345', nameLine: 'みやび' });
  });

  it('title は name→userId→「応援者」の順', () => {
    expect(supporterRowToPersonTile({ userId: '12345', name: 'みやび', avatarUrl: '' }, makeIo()).title).toBe('みやび');
    expect(supporterRowToPersonTile({ userId: '12345', name: '', avatarUrl: '' }, makeIo()).title).toBe('12345');
    expect(supporterRowToPersonTile({ userId: '', name: '', avatarUrl: '' }, makeIo()).title).toBe('応援者');
  });

  // ネガティブコントロール: 退化検知。
  it('ネガコン: avatarUrl 有りと無しで displaySrc が変わる(常に同値退化を検知)', () => {
    const io = makeIo();
    const withUrl = supporterRowToPersonTile({ userId: '12345', name: 'x', avatarUrl: 'https://real/a.jpg' }, io).displaySrc;
    const without = supporterRowToPersonTile({ userId: '12345', name: 'x', avatarUrl: '' }, io).displaySrc;
    expect(withUrl).not.toBe(without);
  });

  it('ネガコン: 数値uid と匿名で導出経路が分岐する(常に identicon/常にサムネ退化を検知)', () => {
    const io = makeIo();
    const numeric = supporterRowToPersonTile({ userId: '12345', name: '', avatarUrl: '', isAnonymous: false }, io).displaySrc;
    const anon = supporterRowToPersonTile({ userId: 'a:zzz', name: '', avatarUrl: '', isAnonymous: true }, io).displaySrc;
    expect(numeric).toContain('thumb');
    expect(anon).toContain('IDENTICON');
    expect(numeric).not.toBe(anon);
  });

  it('null/壊れ row でも投げない', () => {
    expect(() => supporterRowToPersonTile(null, makeIo())).not.toThrow();
    expect(() => supporterRowToPersonTile({}, makeIo())).not.toThrow();
  });
});

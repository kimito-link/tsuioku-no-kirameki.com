import { describe, it, expect } from 'vitest';
import { normalizeAutoBackupState, pruneAutoBackupLives } from './autoBackupState.js';

// v0.1.808: content-entry.js から抽出した純関数の characterization test。
//   抽出前の挙動と完全一致を担保する(挙動完全不変リファクタの安全網)。

describe('normalizeAutoBackupState', () => {
  it('非オブジェクトは空 lives へ(fail-safe)', () => {
    expect(normalizeAutoBackupState(null)).toEqual({ lives: {} });
    expect(normalizeAutoBackupState(undefined)).toEqual({ lives: {} });
    expect(normalizeAutoBackupState('x')).toEqual({ lives: {} });
    expect(normalizeAutoBackupState(42)).toEqual({ lives: {} });
    expect(normalizeAutoBackupState({})).toEqual({ lives: {} });
    expect(normalizeAutoBackupState({ lives: null })).toEqual({ lives: {} });
  });

  it('lid は小文字 trim・空 lid は除外', () => {
    const out = normalizeAutoBackupState({
      lives: { '  LV123 ': { commentCount: 5 }, '': { commentCount: 9 } }
    });
    expect(Object.keys(out.lives)).toEqual(['lv123']);
    expect(out.lives.lv123.liveId).toBe('lv123');
    expect(out.lives.lv123.commentCount).toBe(5);
  });

  it('数値は max(0, Number||0) で正規化・文字列は trim', () => {
    const out = normalizeAutoBackupState({
      lives: {
        lv1: {
          commentCount: -3,
          updatedAt: '1700',
          lastCommentAt: NaN,
          watchUrl: '  https://x  ',
          lastBackupAt: 200,
          lastBackedUpdatedAt: 'abc',
          lastBackupCount: 7
        }
      }
    });
    expect(out.lives.lv1).toEqual({
      liveId: 'lv1',
      commentCount: 0, // -3 → max(0,…)=0
      updatedAt: 1700, // '1700' → 1700
      lastCommentAt: 0, // NaN → 0
      watchUrl: 'https://x',
      lastBackupAt: 200,
      lastBackedUpdatedAt: 0, // 'abc' → 0
      lastBackupCount: 7
    });
  });

  it('meta が非オブジェクトでも安全に既定値で埋める', () => {
    const out = normalizeAutoBackupState({ lives: { lv9: null } });
    expect(out.lives.lv9.commentCount).toBe(0);
    expect(out.lives.lv9.watchUrl).toBe('');
  });
});

describe('pruneAutoBackupLives', () => {
  const mk = (n) => {
    const lives = {};
    for (let i = 0; i < n; i++) {
      lives['lv' + i] = {
        liveId: 'lv' + i,
        commentCount: 0,
        updatedAt: i, // 大きい i ほど新しい
        lastCommentAt: 0,
        watchUrl: '',
        lastBackupAt: 0,
        lastBackedUpdatedAt: 0,
        lastBackupCount: 0
      };
    }
    return { lives };
  };

  it('maxKeep 以下は素通し(同一参照)', () => {
    const s = mk(3);
    expect(pruneAutoBackupLives(s, 40)).toBe(s);
    expect(Object.keys(s.lives).length).toBe(3);
  });

  it('超過時は max(updatedAt,lastBackupAt) 降順で上位 maxKeep に剪定', () => {
    const s = mk(5);
    pruneAutoBackupLives(s, 2);
    // updatedAt が大きい lv4, lv3 が残る
    expect(Object.keys(s.lives).sort()).toEqual(['lv3', 'lv4']);
  });

  it('lastBackupAt が新しければそちらで残す', () => {
    const s = {
      lives: {
        a: { updatedAt: 1, lastBackupAt: 1000 },
        b: { updatedAt: 2, lastBackupAt: 0 },
        c: { updatedAt: 3, lastBackupAt: 0 }
      }
    };
    pruneAutoBackupLives(s, 2);
    // a は lastBackupAt=1000 で最新・c は updatedAt=3 → a,c が残る
    expect(Object.keys(s.lives).sort()).toEqual(['a', 'c']);
  });

  it('maxKeep が不正(NaN等)は 0 扱い=全件剪定', () => {
    const s = mk(3);
    pruneAutoBackupLives(s, NaN);
    expect(Object.keys(s.lives).length).toBe(0);
  });
});

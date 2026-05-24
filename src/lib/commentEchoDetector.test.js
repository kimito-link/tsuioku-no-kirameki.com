import { describe, it, expect } from 'vitest';
import {
  detectCommentPropagation,
  detectCommentSyncBursts,
  normalizeForEcho
} from './commentEchoDetector.js';

const t0 = Date.UTC(2026, 3, 30, 10, 0, 0);
function c(at, userId, text) {
  return { capturedAt: at, userId, text };
}

describe('normalizeForEcho', () => {
  it('全角w→半角w / 大文字小文字統一 / 句読点除去', () => {
    expect(normalizeForEcho('Ｗｗｗ！！')).toBe('www');
    expect(normalizeForEcho('カワイイ。。。')).toBe('カワイイ');
    expect(normalizeForEcho('  8888 ')).toBe('8888');
  });

  it('短すぎる文字列 → 空（"a" などは雑音）', () => {
    expect(normalizeForEcho('a')).toBe('');
    expect(normalizeForEcho('')).toBe('');
  });
});

describe('detectCommentPropagation (L1 コメ伝染)', () => {
  it('入力なし → 空', () => {
    expect(detectCommentPropagation([])).toEqual([]);
  });

  it('30 秒以内に同一語が 3 ユーザーから出る → 伝染検出', () => {
    const r = detectCommentPropagation([
      c(t0, 'A', 'おつ'),
      c(t0 + 5_000, 'B', 'おつ'),
      c(t0 + 15_000, 'C', 'おつ'),
      c(t0 + 100_000, 'D', '別')
    ], { windowMs: 30_000, minDistinctUsers: 3 });
    expect(r.length).toBe(1);
    expect(r[0].text).toBe('おつ');
    expect(r[0].userCount).toBe(3);
  });

  it('同じユーザーが複数回でも user count は 1', () => {
    const r = detectCommentPropagation([
      c(t0, 'A', '8888'),
      c(t0 + 1_000, 'A', '8888'),
      c(t0 + 2_000, 'A', '8888'),
      c(t0 + 5_000, 'B', '8888')
    ], { windowMs: 30_000, minDistinctUsers: 3 });
    expect(r.length).toBe(0);  // distinct user 数が 2 のみ
  });

  it('windowMs を超えた語は別エコーとして集計', () => {
    const r = detectCommentPropagation([
      c(t0, 'A', '草'),
      c(t0 + 5_000, 'B', '草'),
      c(t0 + 10_000, 'C', '草'),
      c(t0 + 60_000, 'D', '草'),
      c(t0 + 65_000, 'E', '草'),
      c(t0 + 70_000, 'F', '草')
    ], { windowMs: 30_000, minDistinctUsers: 3 });
    // 最初のクラスタ ABC と、60 秒離れたクラスタ DEF
    expect(r).toHaveLength(2);
    expect(r.every((b) => b.text === '草' && b.userCount === 3)).toBe(true);
  });

  it('ウィンドウ外側のユーザーでも境界込みで minDistinct に達したら伝染として拾う', () => {
    const r = detectCommentPropagation(
      [
        c(t0, 'A', 'きらめき'),
        c(t0 + 20_000, 'B', 'きらめき'),
        c(t0 + 31_000, 'C', 'きらめき')
      ],
      { windowMs: 30_000, minDistinctUsers: 3 }
    );
    expect(r).toHaveLength(1);
    expect(r[0].userCount).toBe(3);
    expect(r[0].lastAt).toBe(t0 + 31_000);
  });

  it('短すぎるテキスト（normalizeForEcho で空になる）は無視', () => {
    const r = detectCommentPropagation([
      c(t0, 'A', 'a'),
      c(t0 + 1_000, 'B', 'a'),
      c(t0 + 2_000, 'C', 'a')
    ], { windowMs: 30_000, minDistinctUsers: 3 });
    expect(r).toEqual([]);
  });

  it('ピークの順に並ぶ（user count 多い順）', () => {
    const r = detectCommentPropagation([
      c(t0, 'A', 'すごい'),
      c(t0 + 1_000, 'B', 'すごい'),
      c(t0 + 2_000, 'C', 'すごい'),
      c(t0 + 100_000, 'X', 'wktk'),
      c(t0 + 101_000, 'Y', 'wktk'),
      c(t0 + 102_000, 'Z', 'wktk'),
      c(t0 + 103_000, 'W', 'wktk'),
      c(t0 + 104_000, 'V', 'wktk')
    ], { windowMs: 30_000, minDistinctUsers: 3 });
    expect(r[0].text).toBe('wktk');
    expect(r[0].userCount).toBe(5);
  });

  it('null/undefined → 空', () => {
    expect(detectCommentPropagation(null)).toEqual([]);
  });
});

describe('detectCommentSyncBursts (L5 コメ被り瞬間)', () => {
  it('5 秒以内に同一文字列が 3 ユーザーから → "被り" 検出', () => {
    const r = detectCommentSyncBursts([
      c(t0, 'A', '8888'),
      c(t0 + 1_000, 'B', '8888'),
      c(t0 + 3_000, 'C', '8888')
    ], { windowMs: 5_000, minDistinctUsers: 3 });
    expect(r.length).toBe(1);
    expect(r[0].text).toBe('8888');
  });

  it('5 秒を超えると別瞬間', () => {
    const r = detectCommentSyncBursts([
      c(t0, 'A', '8888'),
      c(t0 + 1_000, 'B', '8888'),
      c(t0 + 8_000, 'C', '8888')
    ], { windowMs: 5_000, minDistinctUsers: 3 });
    expect(r.length).toBe(0);
  });

  it('入力なし → 空', () => {
    expect(detectCommentSyncBursts([])).toEqual([]);
  });
});

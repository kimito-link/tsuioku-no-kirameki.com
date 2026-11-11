import { describe, expect, it } from 'vitest';
import {
  classifyGiftPoints,
  excludeComeviewItems,
  filterComeviewGiftView,
  namePatternMatches,
  normalizeComeviewExclude
} from './comeviewGiftFilter.js';

const comment = { kind: 'comment', userId: '10', nickname: '花子', text: 'こんにちは' };
const paid = { kind: 'gift', userId: '11', nickname: '太郎', point: 50, itemName: '花火' };
const free = { kind: 'gift', userId: '12', nickname: '次郎', point: 0, itemName: '拍手' };
const unknown = { kind: 'gift', userId: '13', nickname: '三郎', itemName: '不明' };

describe('ギフトの表示と外す人', () => {
  it('ポイントの有無を分ける', () => {
    expect(classifyGiftPoints(comment)).toBe('comment');
    expect(classifyGiftPoints(paid)).toBe('paid');
    expect(classifyGiftPoints(free)).toBe('free');
    expect(classifyGiftPoints(unknown)).toBe('unknown');
    expect(classifyGiftPoints({ kind: 'gift', point: 10, free: true })).toBe('free');
  });

  it('ギフトだけの表示はコメントを隠す。ポイントの無いギフトはポイントありにもなしにも出さない', () => {
    const rows = [comment, paid, free, unknown];
    expect(filterComeviewGiftView(rows, 'gifts').map((row) => row.userId)).toEqual(['11', '12', '13']);
    expect(filterComeviewGiftView(rows, 'paid').map((row) => row.userId)).toEqual(['11']);
    expect(filterComeviewGiftView(rows, 'free').map((row) => row.userId)).toEqual(['12']);
    expect(filterComeviewGiftView(rows, 'nope')).toHaveLength(4);
    expect(rows).toHaveLength(4);
  });

  it('名前はアスタリスク1つだけ。IDは完全一致', () => {
    expect(namePatternMatches('花*', '花子')).toBe(true);
    expect(namePatternMatches('*子', '花子')).toBe(true);
    expect(namePatternMatches('花*子', '花子')).toBe(true);
    expect(namePatternMatches('花*子', '花')).toBe(false);
    expect(namePatternMatches('花**', '花子')).toBe(false);
    expect(namePatternMatches('*', '花子')).toBe(false);
    const rules = normalizeComeviewExclude({ names: ['花*', '花**'], ids: ['12', '1*'] });
    const hidden = excludeComeviewItems([comment, paid, free], rules).map((row) => row.userId);
    expect(hidden).toEqual(['11']);
  });

  it('行数の上限を超えない', () => {
    const names = Array.from({ length: 100 }, (_, i) => `人${i}`);
    expect(normalizeComeviewExclude({ names }).names).toHaveLength(80);
  });
});
import { describe, it, expect } from 'vitest';
import { buildStoryUserLaneRenderSignature } from './storyUserLaneRenderSignature.js';

// characterization テスト: 抽出前の storyUserLaneRenderSignature の出力を固定。
//   stableId 解決は注入（entry.id をそのまま返す決定的フォーマッタ）。

const FIELD = '';
const ROW = '';
const stableIdOf = (e) => String(e?.id || '');

const pick = (over = {}) => ({
  displaySrc: 'src.png',
  meta: { idLine: 'ID1', nameLine: 'name1' },
  profileTier: 3,
  entry: { id: 'e1' },
  ...over
});
const gift = (over = {}) => ({
  displaySrc: 'g.png',
  meta: { idLine: 'GID', nameLine: 'gname' },
  entry: { id: 'g1' },
  ...over
});

describe('buildStoryUserLaneRenderSignature', () => {
  it('picked 空・gift 空: src 件数 + |G:0', () => {
    const sig = buildStoryUserLaneRenderSignature({
      liveId: 'LV123',
      colorScheme: 'light',
      picked: [],
      giftPicks: [],
      sourceEntryCount: 42,
      stableIdOf
    });
    expect(sig).toBe('lv123|light|0|src:42|G:0');
  });

  it('liveId は小文字化・trim される', () => {
    const sig = buildStoryUserLaneRenderSignature({
      liveId: '  LV999  ',
      colorScheme: 'dark',
      picked: [],
      giftPicks: [],
      sourceEntryCount: 0,
      stableIdOf
    });
    expect(sig.startsWith('lv999|dark|0|src:0')).toBe(true);
  });

  it('picked あり: 件数 + FIELD/ROW 区切りの行', () => {
    const sig = buildStoryUserLaneRenderSignature({
      liveId: 'lv1',
      colorScheme: 'light',
      picked: [pick({ entry: { id: 'a' } }), pick({ entry: { id: 'b' }, profileTier: 2 })],
      giftPicks: [],
      sourceEntryCount: 5,
      stableIdOf
    });
    const expectedRow0 = ['a', 'src.png', 'ID1', 'name1', '3'].join(FIELD);
    const expectedRow1 = ['b', 'src.png', 'ID1', 'name1', '2'].join(FIELD);
    expect(sig).toBe(`lv1|light|2${ROW}${expectedRow0}${ROW}${expectedRow1}|G:0`);
  });

  it('gift あり: G セグメントが ROW 区切りで付く', () => {
    const sig = buildStoryUserLaneRenderSignature({
      liveId: 'lv1',
      colorScheme: 'light',
      picked: [],
      giftPicks: [gift({ entry: { id: 'g1' } })],
      sourceEntryCount: 3,
      stableIdOf
    });
    const giftRow = ['g1', 'g.png', 'GID', 'gname'].join(FIELD);
    expect(sig).toBe(`lv1|light|0|src:3${ROW}G:${giftRow}`);
  });

  it('変化検出: 1 フィールド違えば signature が変わる', () => {
    const base = {
      liveId: 'lv1',
      colorScheme: 'light',
      picked: [pick()],
      giftPicks: [],
      sourceEntryCount: 1,
      stableIdOf
    };
    const a = buildStoryUserLaneRenderSignature(base);
    const b = buildStoryUserLaneRenderSignature({
      ...base,
      picked: [pick({ meta: { idLine: 'ID1', nameLine: 'CHANGED' } })]
    });
    expect(a).not.toBe(b);
  });

  it('堅牢性: 非オブジェクト入力でも投げない', () => {
    expect(typeof buildStoryUserLaneRenderSignature(null)).toBe('string');
  });
});

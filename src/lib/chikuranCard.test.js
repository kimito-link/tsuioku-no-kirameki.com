import { describe, it, expect } from 'vitest';
import { formatElapsedText, buildChikuranCardModel, buildChikuranList } from './chikuranCard.js';

describe('formatElapsedText', () => {
  it('時間あり=h:mm:ss / 時間なし=m:ss', () => {
    expect(formatElapsedText(3661)).toBe('1:01:01');
    expect(formatElapsedText(125)).toBe('2:05');
    expect(formatElapsedText(0)).toBe('0:00'); // 0秒は「0:00」(未取得ではない)
  });
  it('未取得(null/空文字)/負は null', () => {
    expect(formatElapsedText(null)).toBeNull();
    expect(formatElapsedText('')).toBeNull();
    expect(formatElapsedText(-5)).toBeNull();
    expect(formatElapsedText('x')).toBeNull();
  });
});

describe('buildChikuranCardModel', () => {
  it('live を表示モデルに整形(取れない値は null)', () => {
    const m = buildChikuranCardModel({
      lv: 'lv350791445',
      broadcasterName: '株式会社ドワンゴ',
      title: '日本テレビ',
      thumbnailUrl: 'https://x/thumb.jpg',
      elapsedSec: 37200,
      watchCount: 46803,
      recordedCount: 78343,
      giftPoints: 30,
      adPoints: null,
      endedAt: null
    });
    expect(m).toMatchObject({
      lv: 'lv350791445',
      broadcasterName: '株式会社ドワンゴ',
      thumbnailUrl: 'https://x/thumb.jpg',
      elapsedText: '10:20:00',
      watchCount: 46803,
      commentCount: 78343,
      giftPoints: 30,
      adPoints: null,
      ended: false
    });
  });

  it('lv 無しは null', () => {
    expect(buildChikuranCardModel({ broadcasterName: 'x' })).toBeNull();
  });

  it('サムネ無し=空文字(DOM 側でプレースホルダ)', () => {
    expect(buildChikuranCardModel({ lv: 'lv1' }).thumbnailUrl).toBe('');
  });
});

describe('buildChikuranList', () => {
  it('放送中を上・来場降順・終了は末尾', () => {
    const list = buildChikuranList([
      { lv: 'lv1', watchCount: 100, recordedCount: 10, endedAt: null },
      { lv: 'lv2', watchCount: 500, recordedCount: 20, endedAt: null },
      { lv: 'lv3', watchCount: 9999, recordedCount: 5, endedAt: 1234 }, // 終了=末尾
      { lv: 'lv4', watchCount: 300, recordedCount: 30, endedAt: null }
    ]);
    expect(list.map((m) => m.lv)).toEqual(['lv2', 'lv4', 'lv1', 'lv3']);
  });

  it('来場同数はコメント降順', () => {
    const list = buildChikuranList([
      { lv: 'lv1', watchCount: 100, recordedCount: 10, endedAt: null },
      { lv: 'lv2', watchCount: 100, recordedCount: 50, endedAt: null }
    ]);
    expect(list.map((m) => m.lv)).toEqual(['lv2', 'lv1']);
  });

  it('空/不正でも落ちない', () => {
    expect(buildChikuranList(null)).toEqual([]);
    expect(buildChikuranList([{ broadcasterName: 'no-lv' }])).toEqual([]);
  });
});

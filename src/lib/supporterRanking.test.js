import { describe, it, expect } from 'vitest';
import { buildSupporterRanking, buildSupporterRankingLines } from './supporterRanking.js';

describe('buildSupporterRanking', () => {
  it('件数降順で順位を採番する', () => {
    const rows = buildSupporterRanking([
      { userId: '100', nickname: 'A', avatarUrl: 'a.png', count: 5 },
      { userId: '200', nickname: 'B', avatarUrl: 'b.png', count: 12 },
      { userId: '300', nickname: 'C', avatarUrl: '', count: 8 }
    ]);
    expect(rows.map((r) => [r.rank, r.name, r.count])).toEqual([
      [1, 'B', 12],
      [2, 'C', 8],
      [3, 'A', 5]
    ]);
  });

  it('匿名(a:hash / anon: / 空)は isAnonymous=true・名前は nickname 優先、無ければ「匿名」', () => {
    const rows = buildSupporterRanking([
      { userId: 'a:abc123', nickname: '', count: 3 },
      { userId: 'anon:xyz', nickname: 'ニック', count: 2 },
      { userId: '', nickname: '', count: 1 }
    ]);
    expect(rows[0]).toMatchObject({ name: '匿名', isAnonymous: true });
    expect(rows[1]).toMatchObject({ name: 'ニック', isAnonymous: true });
    expect(rows[2]).toMatchObject({ name: '匿名', isAnonymous: true });
  });

  it('数値IDは isAnonymous=false', () => {
    const rows = buildSupporterRanking([{ userId: '4046119', nickname: 'りんく', count: 9 }]);
    expect(rows[0].isAnonymous).toBe(false);
    expect(rows[0].name).toBe('りんく');
  });

  it('count 0 / 負は除外(応援者でない)', () => {
    const rows = buildSupporterRanking([
      { userId: '1', nickname: 'A', count: 0 },
      { userId: '2', nickname: 'B', count: -3 },
      { userId: '3', nickname: 'C', count: 4 }
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('C');
  });

  it('limit で上位 N 件に絞る', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ userId: String(i), nickname: `U${i}`, count: 100 - i }));
    expect(buildSupporterRanking(many, { limit: 3 })).toHaveLength(3);
    expect(buildSupporterRanking(many, { limit: 3 })[0].count).toBe(100);
  });

  it('null/空/不正でも落ちない', () => {
    expect(buildSupporterRanking(null)).toEqual([]);
    expect(buildSupporterRanking([])).toEqual([]);
    expect(buildSupporterRanking('x')).toEqual([]);
  });
});

describe('buildSupporterRankingLines', () => {
  it('上位をメダル+件数で整形(匿名は明示)', () => {
    const rows = buildSupporterRanking([
      { userId: '4046119', nickname: 'りんく', count: 12 },
      { userId: 'a:abc', nickname: '', count: 8 },
      { userId: '200', nickname: 'B', count: 5 }
    ]);
    const text = buildSupporterRankingLines(rows);
    expect(text).toContain('応援者ランキング(この配信):');
    expect(text).toContain('🥇 りんく 12件');
    expect(text).toContain('🥈 匿名(匿名) 8件');
    expect(text).toContain('🥉 B 5件');
  });

  it('4位以降は数字、max で打ち切る', () => {
    const rows = buildSupporterRanking(
      Array.from({ length: 6 }, (_, i) => ({ userId: String(i), nickname: `U${i}`, count: 10 - i }))
    );
    const text = buildSupporterRankingLines(rows, { max: 4 });
    expect(text).toContain('4. U3 7件');
    expect(text).not.toContain('U4');
  });

  it('空なら空文字(ノイズにしない)', () => {
    expect(buildSupporterRankingLines([])).toBe('');
    expect(buildSupporterRankingLines(null)).toBe('');
  });
});

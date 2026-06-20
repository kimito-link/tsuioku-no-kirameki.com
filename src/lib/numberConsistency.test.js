import { describe, it, expect } from 'vitest';
import { detectNumberInconsistencies } from './numberConsistency.js';

describe('detectNumberInconsistencies', () => {
  it('正常な数字なら何も出さない', () => {
    const out = detectNumberInconsistencies({
      livesData: [{ lv: 'lv1', recordedCount: 194, officialCommentCount: 193 }],
      reportPreview: {
        totalComments: 188,
        uniqueUsers: 127,
        commenters: 26,
        visitors: 811
      }
    });
    expect(out).toEqual([]);
  });

  it('記録が公式を大きく上回る(>130%)を warn で検知', () => {
    const out = detectNumberInconsistencies({
      livesData: [{ lv: 'lv1', recordedCount: 300, officialCommentCount: 200 }]
    });
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('warn');
    expect(out[0].message).toContain('記録(300)');
    expect(out[0].message).toContain('公式(200)');
    expect(out[0].message).toContain('150%');
  });

  it('取得率 130% ちょうど・101% 等の軽微な超過は出さない(正常な揺れ)', () => {
    expect(
      detectNumberInconsistencies({
        livesData: [{ lv: 'lv1', recordedCount: 130, officialCommentCount: 100 }]
      })
    ).toEqual([]);
    expect(
      detectNumberInconsistencies({
        livesData: [{ lv: 'lv1', recordedCount: 101, officialCommentCount: 100 }]
      })
    ).toEqual([]);
  });

  it('コメントした人 > 来場 は論理矛盾=bad', () => {
    const out = detectNumberInconsistencies({
      reportPreview: { totalComments: 100, commenters: 900, visitors: 800 }
    });
    const f = out.find((x) => x.id === 'commenters-gt-visitors');
    expect(f).toBeTruthy();
    expect(f.severity).toBe('bad');
    expect(f.message).toContain('コメントした人」(900)');
    expect(f.message).toContain('来場」(800)');
  });

  it('のべ別キー > 本文コメント数 は不可能=warn', () => {
    const out = detectNumberInconsistencies({
      reportPreview: { totalComments: 100, uniqueUsers: 120 }
    });
    const f = out.find((x) => x.id === 'uniquekeys-gt-total');
    expect(f).toBeTruthy();
    expect(f.severity).toBe('warn');
  });

  it('レポート本文が記録総数の半分未満=過小集計の疑い(v0.1.853 型)を warn', () => {
    const out = detectNumberInconsistencies({
      livesData: [{ lv: 'lv1', recordedCount: 7855 }],
      reportPreview: { totalComments: 27 }
    });
    const f = out.find((x) => x.id === 'report-undercount');
    expect(f).toBeTruthy();
    expect(f.message).toContain('本文コメント(27)');
    expect(f.message).toContain('記録総数(7,855)');
  });

  it('過小集計チェックは配信が1つに特定できる時だけ(複数配信ならスキップ)', () => {
    const out = detectNumberInconsistencies({
      livesData: [
        { lv: 'lv1', recordedCount: 7855 },
        { lv: 'lv2', recordedCount: 10 }
      ],
      reportPreview: { totalComments: 27 }
    });
    expect(out.find((x) => x.id === 'report-undercount')).toBeUndefined();
  });

  it('記録総数が小さい(<50)時は過小集計チェックを出さない(誤検知防止)', () => {
    const out = detectNumberInconsistencies({
      livesData: [{ lv: 'lv1', recordedCount: 40 }],
      reportPreview: { totalComments: 5 }
    });
    expect(out.find((x) => x.id === 'report-undercount')).toBeUndefined();
  });

  it('入力欠落・空でも落ちない', () => {
    expect(detectNumberInconsistencies({})).toEqual([]);
    expect(detectNumberInconsistencies(null)).toEqual([]);
    expect(detectNumberInconsistencies({ livesData: 'x', reportPreview: 5 })).toEqual([]);
  });

  it('official<=0 の配信は取得率チェック対象外(0除算回避)', () => {
    const out = detectNumberInconsistencies({
      livesData: [{ lv: 'lv1', recordedCount: 100, officialCommentCount: 0 }]
    });
    expect(out).toEqual([]);
  });
});

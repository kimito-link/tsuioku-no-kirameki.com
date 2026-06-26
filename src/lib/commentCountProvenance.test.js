import { describe, it, expect } from 'vitest';
import {
  RECORD_OVER_OFFICIAL_NORMAL_MAX_PCT,
  buildCommentCountProvenance,
  formatCommentCountProvenanceLines,
  commentCountProvenanceToActionCards
} from './commentCountProvenance.js';

describe('buildCommentCountProvenance', () => {
  it('記録/本家の両方から出どころを組む', () => {
    const p = buildCommentCountProvenance({
      lv: 'lv1', recordedCount: 1005, officialCommentCount: 926, lastIngestAgoMs: 5 * 60 * 1000
    });
    expect(p.recorded.value).toBe(1005);
    expect(p.official.value).toBe(926);
    expect(p.recorded.source).toContain('IndexedDB');
    expect(p.official.source).toContain('NDGR');
    expect(p.ratePct).toBe(Math.round((1005 / 926) * 100)); // 109
    expect(p.recordedExceedsOfficial).toBe(true);
  });

  it('本家の取得経過を秒/分でラベル化', () => {
    const p1 = buildCommentCountProvenance({ recordedCount: 10, officialCommentCount: 9, lastIngestAgoMs: 5000 });
    expect(p1.official.ageLabel).toBe('5秒前');
    const p2 = buildCommentCountProvenance({ recordedCount: 10, officialCommentCount: 9, lastIngestAgoMs: 5 * 60 * 1000 });
    expect(p2.official.ageLabel).toBe('5分前');
  });

  it('逆転していなければ recordedExceedsOfficial=false', () => {
    const p = buildCommentCountProvenance({ recordedCount: 800, officialCommentCount: 926 });
    expect(p.recordedExceedsOfficial).toBe(false);
  });

  it('数字が無ければ null', () => {
    expect(buildCommentCountProvenance({ lv: 'lv1' })).toBe(null);
    expect(buildCommentCountProvenance(null)).toBe(null);
  });

  it('片方だけでも組む(本家のみ)', () => {
    const p = buildCommentCountProvenance({ officialCommentCount: 926 });
    expect(p.recorded.value).toBe(null);
    expect(p.official.value).toBe(926);
    expect(p.ratePct).toBe(null);
    expect(p.recordedExceedsOfficial).toBe(false);
    expect(p.verdict).toBe('unknown'); // 材料不足=判定しない
  });

  it('official=0 のとき ratePct は出さない(ゼロ除算回避)', () => {
    const p = buildCommentCountProvenance({ recordedCount: 5, officialCommentCount: 0 });
    expect(p.ratePct).toBe(null);
    expect(p.verdict).toBe('unknown');
  });
});

describe('buildCommentCountProvenance 3段階判定', () => {
  it('記録≤本家=ok(正常)', () => {
    const p = buildCommentCountProvenance({ recordedCount: 800, officialCommentCount: 926, lastIngestAgoMs: 5000 });
    expect(p.verdict).toBe('ok');
  });

  it('記録>本家・本家遅延・130%以内=normal(正常範囲)', () => {
    // 109%・本家は5分前(遅延)→記録が即時単調で先行=正常
    const p = buildCommentCountProvenance({ recordedCount: 1005, officialCommentCount: 926, lastIngestAgoMs: 5 * 60 * 1000 });
    expect(p.verdict).toBe('normal');
    expect(p.ratePct).toBe(109);
  });

  it('記録>本家・130%超=check(要確認)', () => {
    const p = buildCommentCountProvenance({ recordedCount: 1400, officialCommentCount: 926, lastIngestAgoMs: 5 * 60 * 1000 });
    expect(p.ratePct).toBeGreaterThan(RECORD_OVER_OFFICIAL_NORMAL_MAX_PCT);
    expect(p.verdict).toBe('check');
    expect(p.verdictReason).toContain('別配信');
  });

  it('記録>本家・本家が新鮮(60秒以内)なのに超過=check(遅延で説明できない)', () => {
    const p = buildCommentCountProvenance({ recordedCount: 1005, officialCommentCount: 926, lastIngestAgoMs: 10 * 1000 });
    expect(p.verdict).toBe('check');
    expect(p.verdictReason).toContain('新鮮');
  });
});

describe('formatCommentCountProvenanceLines', () => {
  it('セクション見出しと各数字の出どころ+判定を並べる', () => {
    const lines = formatCommentCountProvenanceLines([
      { lv: 'lv1', recordedCount: 1005, officialCommentCount: 926, lastIngestAgoMs: 5 * 60 * 1000 }
    ]);
    const text = lines.join('\n');
    expect(text).toContain('### 数字の出どころ（何を数えているか）');
    expect(text).toContain('正常/要確認の判定');
    expect(text).toContain('記録 1,005');
    expect(text).toContain('本家コメ 926');
    expect(text).toContain('一致度: 記録/本家 = 109%');
    expect(text).toContain('判定: 🟢 正常');
  });

  it('130%超は要確認🟡を出す', () => {
    const text = formatCommentCountProvenanceLines([
      { lv: 'lv1', recordedCount: 1400, officialCommentCount: 926, lastIngestAgoMs: 5 * 60 * 1000 }
    ]).join('\n');
    expect(text).toContain('判定: 🟡 要確認');
  });

  it('記録≤本家は正常🟢', () => {
    const text = formatCommentCountProvenanceLines([
      { lv: 'lv1', recordedCount: 800, officialCommentCount: 926, lastIngestAgoMs: 5000 }
    ]).join('\n');
    expect(text).toContain('判定: 🟢 正常');
  });

  it('数字が無ければ空配列(セクションごと出さない)', () => {
    expect(formatCommentCountProvenanceLines([{ lv: 'lv1' }])).toEqual([]);
    expect(formatCommentCountProvenanceLines([])).toEqual([]);
    expect(formatCommentCountProvenanceLines(null)).toEqual([]);
  });

  it('複数配信を順に並べる', () => {
    const lines = formatCommentCountProvenanceLines([
      { lv: 'lv1', recordedCount: 100, officialCommentCount: 90, lastIngestAgoMs: 5 * 60 * 1000 },
      { lv: 'lv2', recordedCount: 50, officialCommentCount: 80, lastIngestAgoMs: 5000 }
    ]);
    const text = lines.join('\n');
    expect(text).toContain('[lv1]');
    expect(text).toContain('[lv2]');
  });
});

describe('commentCountProvenanceToActionCards', () => {
  it('check の配信だけ warn カードに昇格', () => {
    const cards = commentCountProvenanceToActionCards([
      { lv: 'lv1', recordedCount: 1400, officialCommentCount: 926, lastIngestAgoMs: 5 * 60 * 1000 }, // check
      { lv: 'lv2', recordedCount: 800, officialCommentCount: 926, lastIngestAgoMs: 5000 } // ok
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('comment-count-check-lv1');
    expect(cards[0].severity).toBe('warn');
  });

  it('ok/normal はカードゼロ(誤検知ゼロ)', () => {
    const cards = commentCountProvenanceToActionCards([
      { lv: 'lv1', recordedCount: 1005, officialCommentCount: 926, lastIngestAgoMs: 5 * 60 * 1000 } // normal
    ]);
    expect(cards).toEqual([]);
  });

  it('空入力でカードゼロ', () => {
    expect(commentCountProvenanceToActionCards([])).toEqual([]);
    expect(commentCountProvenanceToActionCards(null)).toEqual([]);
  });
});

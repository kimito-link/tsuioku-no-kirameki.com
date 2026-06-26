import { describe, it, expect } from 'vitest';
import {
  buildCommentCountProvenance,
  formatCommentCountProvenanceLines
} from './commentCountProvenance.js';

describe('buildCommentCountProvenance', () => {
  it('記録/本家の両方から出どころを組む', () => {
    const p = buildCommentCountProvenance({
      lv: 'lv1', recordedCount: 1005, officialCommentCount: 926, lastIngestAgoMs: 5000
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
  });

  it('official=0 のとき ratePct は出さない(ゼロ除算回避)', () => {
    const p = buildCommentCountProvenance({ recordedCount: 5, officialCommentCount: 0 });
    expect(p.ratePct).toBe(null);
  });
});

describe('formatCommentCountProvenanceLines', () => {
  it('セクション見出しと各数字の出どころを並べる', () => {
    const lines = formatCommentCountProvenanceLines([
      { lv: 'lv1', recordedCount: 1005, officialCommentCount: 926, lastIngestAgoMs: 5000 }
    ]);
    const text = lines.join('\n');
    expect(text).toContain('### 数字の出どころ（何を数えているか）');
    expect(text).toContain('判定はしていません');
    expect(text).toContain('記録 1,005');
    expect(text).toContain('本家コメ 926');
    expect(text).toContain('IndexedDB');
    expect(text).toContain('NDGR');
    expect(text).toContain('一致度: 記録/本家 = 109%');
  });

  it('逆転のとき構造的理由の注記を出す(警告ではない)', () => {
    const text = formatCommentCountProvenanceLines([
      { lv: 'lv1', recordedCount: 1005, officialCommentCount: 926 }
    ]).join('\n');
    expect(text).toContain('記録が本家コメより多いことがあります');
    expect(text).toContain('壊れてはいません');
    expect(text).not.toContain('⚠'); // 警告マークは出さない(今回は判定しない)
  });

  it('逆転していなければ注記なし', () => {
    const text = formatCommentCountProvenanceLines([
      { lv: 'lv1', recordedCount: 800, officialCommentCount: 926 }
    ]).join('\n');
    expect(text).not.toContain('記録が本家コメより多いことがあります');
  });

  it('数字が無ければ空配列(セクションごと出さない)', () => {
    expect(formatCommentCountProvenanceLines([{ lv: 'lv1' }])).toEqual([]);
    expect(formatCommentCountProvenanceLines([])).toEqual([]);
    expect(formatCommentCountProvenanceLines(null)).toEqual([]);
  });

  it('複数配信を順に並べる', () => {
    const lines = formatCommentCountProvenanceLines([
      { lv: 'lv1', recordedCount: 100, officialCommentCount: 90 },
      { lv: 'lv2', recordedCount: 50, officialCommentCount: 80 }
    ]);
    const text = lines.join('\n');
    expect(text).toContain('[lv1]');
    expect(text).toContain('[lv2]');
  });
});

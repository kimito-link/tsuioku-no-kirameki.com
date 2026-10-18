import { describe, expect, it } from 'vitest';
import { parseTileStatsText, speechSupportLine, speechEmptyMessage } from './venueSpeechStats.js';
import { formatLaneTileStats } from './laneTileStats.js';

describe('parseTileStatsText', () => {
  it('3つ全部を数に戻す(桁区切りつき)', () => {
    expect(parseTileStatsText('🎁1,234 📣10 💬5')).toEqual({ gift: 1234, ad: 10, comments: 5 });
  });
  it('一部だけ・空・不正は null(0 を捏造しない)', () => {
    expect(parseTileStatsText('📣4,857')).toEqual({ gift: null, ad: 4857, comments: null });
    expect(parseTileStatsText('')).toEqual({ gift: null, ad: null, comments: null });
    expect(parseTileStatsText(undefined)).toEqual({ gift: null, ad: null, comments: null });
    expect(parseTileStatsText('🎁0')).toEqual({ gift: null, ad: null, comments: null });
  });
  it('★タイルを作る formatLaneTileStats の出力と往復して一致する(書式が変わったら赤)', () => {
    const stats = { giftPt: 39828, adPt: 4857, commentCount: 6 };
    expect(parseTileStatsText(formatLaneTileStats(stats))).toEqual({ gift: 39828, ad: 4857, comments: 6 });
  });
});

describe('speechSupportLine', () => {
  it('ギフトと広告を出す(発言は見出しが出すので入れない)', () => {
    expect(speechSupportLine('🎁10 📣4,857 💬6')).toBe('🎁 ギフト 10pt ・ 📣 広告 4,857pt');
    expect(speechSupportLine('🎁10')).toBe('🎁 ギフト 10pt');
    expect(speechSupportLine('📣3')).toBe('📣 広告 3pt');
  });
  it('ギフトも広告も無ければ空', () => {
    expect(speechSupportLine('💬6')).toBe('');
    expect(speechSupportLine('')).toBe('');
  });
});

describe('speechEmptyMessage', () => {
  it('★ギフト・広告の記録がある人に「発言がありません」だけを見せない', () => {
    expect(speechEmptyMessage('🎁10')).toContain('ギフト・広告のみ');
    expect(speechEmptyMessage('🎁10')).not.toContain('まだ発言がありません');
  });
  it('記録が何も無い人は従来の文言', () => {
    expect(speechEmptyMessage('')).toBe('この配信の記録にはまだ発言がありません');
    expect(speechEmptyMessage('💬6')).toBe('この配信の記録にはまだ発言がありません');
  });
});

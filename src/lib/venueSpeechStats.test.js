import { describe, expect, it } from 'vitest';
import { parseTileStatsText, speechSupportLine, speechEmptyMessage, speechFallbackNote, speechFallbackListHtml } from './venueSpeechStats.js';
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
  });
  it('★タイルに 💬 がある人に「ギフト・広告のみ」「まだ発言がありません」と言わない(2026-11-03 実機)', () => {
    expect(speechEmptyMessage('🎁500 💬1')).not.toContain('ギフト・広告のみ');
    expect(speechEmptyMessage('💬6')).not.toContain('まだ発言がありません');
    expect(speechEmptyMessage('💬6')).toContain('6 回');
  });
  it('★記録を読めなかったときは「無い」と言い切らず理由を言う', () => {
    expect(speechEmptyMessage('🎁500', { contextLost: true })).toContain('F5');
    expect(speechEmptyMessage('🎁500', { contextLost: true })).not.toContain('ギフト・広告のみ');
    expect(speechEmptyMessage('', { readFailed: true })).toContain('間に合いませんでした');
  });
});

describe('speechFallbackNote', () => {
  it('代わりに出す本文が無ければ空', () => {
    expect(speechFallbackNote(0)).toBe('');
    expect(speechFallbackNote(NaN, { contextLost: true })).toBe('');
  });
  it('件数と理由を出す', () => {
    expect(speechFallbackNote(2)).toContain('2 件');
    expect(speechFallbackNote(2, { contextLost: true })).toContain('F5');
    expect(speechFallbackNote(2, { readFailed: true })).toContain('間に合わなかった');
  });
});

describe('speechFallbackListHtml', () => {
  const esc = (s) => String(s).replace(/</g, '&lt;');
  it('手元の発言が無ければ空', () => {
    expect(speechFallbackListHtml([], {}, esc)).toBe('');
    expect(speechFallbackListHtml(undefined, {}, esc)).toBe('');
  });
  it('新しい順のまま並べ、注記に理由を出し、本文はエスケープする', () => {
    const html = speechFallbackListHtml(['ユキちゃん', '<b>ww</b>', ' '], { contextLost: true }, esc);
    expect(html.indexOf('ユキちゃん')).toBeLessThan(html.indexOf('ww'));
    expect(html).toContain('2 件');
    expect(html).toContain('F5');
    expect(html).not.toContain('<b>');
  });
});

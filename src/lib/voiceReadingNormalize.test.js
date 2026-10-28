import { describe, expect, it } from 'vitest';
import { normalizeVoiceReadingBody } from './voiceReadingNormalize.js';

describe('normalizeVoiceReadingBody', () => {
  it('笑いの w を「わら」にする(半角・全角・文末の1文字)', () => {
    expect(normalizeVoiceReadingBody('かわいいwww')).toBe('かわいいわらわら');
    expect(normalizeVoiceReadingBody('ｗｗｗｗ')).toBe('わらわら');
    expect(normalizeVoiceReadingBody('それなww')).toBe('それなわら');
    expect(normalizeVoiceReadingBody('それなw')).toBe('それなわら');
    expect(normalizeVoiceReadingBody('草www生える')).toBe('草わらわら生える');
  });
  it('英単語や URL の w には触らない', () => {
    expect(normalizeVoiceReadingBody('wow')).toBe('wow');
    expect(normalizeVoiceReadingBody('new')).toBe('new');
    expect(normalizeVoiceReadingBody('www.example.com 見て')).toBe('URL省略 見て');
    expect(normalizeVoiceReadingBody('ok w')).toBe('ok w');
  });
  it('拍手の 8 を「パチパチ」にする・数や金額は残す', () => {
    expect(normalizeVoiceReadingBody('88888')).toBe('パチパチ');
    expect(normalizeVoiceReadingBody('おめでとう８８８８')).toBe('おめでとうパチパチ');
    expect(normalizeVoiceReadingBody('8888円')).toBe('8888円');
    expect(normalizeVoiceReadingBody('18888')).toBe('18888');
    expect(normalizeVoiceReadingBody('88')).toBe('88');
  });
  it('同じ文字の連打を4文字に縮める', () => {
    expect(normalizeVoiceReadingBody('ああああああああ')).toBe('ああああ');
    expect(normalizeVoiceReadingBody('すごーーーーーーい！！！！！！')).toBe('すごーーーーい！！！！');
    expect(normalizeVoiceReadingBody('😂😂😂😂😂😂')).toBe('😂😂😂😂');
    expect(normalizeVoiceReadingBody('ああああ')).toBe('ああああ');
  });
  it('URL の読み方を変えられる(スマホは「リンク」)', () => {
    expect(normalizeVoiceReadingBody('見て https://example.com/x', { urlWord: 'リンク' })).toBe('見て リンク');
  });
  it('空・空白・null', () => {
    expect(normalizeVoiceReadingBody('')).toBe('');
    expect(normalizeVoiceReadingBody(null)).toBe('');
    expect(normalizeVoiceReadingBody('  a   b  ')).toBe('a b');
  });
});

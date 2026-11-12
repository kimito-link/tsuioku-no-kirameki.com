import { describe, it, expect } from 'vitest';
import {
  createVoiceClipCache,
  isVoiceClipCacheableText,
  voiceClipKey,
  VOICE_CLIP_MAX_CHARS
} from './voiceClipCache.js';

const wav = (n) => new ArrayBuffer(n);
const voice = { styleId: 3, pitchOffset: 0.05, speedOffset: -0.1 };

describe('voiceClipKey / isVoiceClipCacheableText', () => {
  it('短い文だけ覚える(長文・空は覚えない)', () => {
    expect(isVoiceClipCacheableText('わこつ')).toBe(true);
    expect(isVoiceClipCacheableText('あ'.repeat(VOICE_CLIP_MAX_CHARS))).toBe(true);
    expect(isVoiceClipCacheableText('あ'.repeat(VOICE_CLIP_MAX_CHARS + 1))).toBe(false);
    expect(isVoiceClipCacheableText('')).toBe(false);
    expect(isVoiceClipCacheableText(null)).toBe(false);
  });

  it('声(style・高さ・その人の速さ)と文で鍵が変わる', () => {
    const k = voiceClipKey(voice, '草');
    expect(k).not.toBe('');
    expect(voiceClipKey({ ...voice, styleId: 4 }, '草')).not.toBe(k);
    expect(voiceClipKey({ ...voice, pitchOffset: 0 }, '草')).not.toBe(k);
    expect(voiceClipKey({ ...voice, speedOffset: 0 }, '草')).not.toBe(k);
    expect(voiceClipKey(voice, 'わら')).not.toBe(k);
    expect(voiceClipKey(voice, '草')).toBe(k);
  });

  it('声が分からないときは覚えない', () => {
    expect(voiceClipKey({}, '草')).toBe('');
    expect(voiceClipKey(null, '草')).toBe('');
  });
});

describe('createVoiceClipCache', () => {
  it('覚えて取り出せる', () => {
    const c = createVoiceClipCache();
    const k = voiceClipKey(voice, '888');
    expect(c.get(k, 0)).toBeNull();
    const w = wav(1000);
    expect(c.put(k, 0, w)).toBe(true);
    expect(c.has(k)).toBe(true);
    expect(c.get(k, 0)).toEqual({ wav: w, boost: 0 });
    expect(c.stats()).toEqual({ keys: 1, bytes: 1000 });
  });

  it('今の早口以下でいちばん速い声を選び、無ければいちばん遅い声', () => {
    const c = createVoiceClipCache();
    const k = voiceClipKey(voice, 'おつ');
    const slow = wav(1000);
    const mid = wav(900);
    const fast = wav(800);
    c.put(k, 0, slow);
    c.put(k, 0.25, mid);
    c.put(k, 0.35, fast);
    expect(c.get(k, 0).wav).toBe(slow);
    expect(c.get(k, 0.3).wav).toBe(mid);
    expect(c.get(k, 0.5).wav).toBe(fast);
    const c2 = createVoiceClipCache();
    c2.put(k, 0.25, mid);
    c2.put(k, 0.35, fast);
    expect(c2.get(k, 0)).toEqual({ wav: mid, boost: 0.25 });
  });

  it('上限を超えたら、いちばん長く使われていない声から捨てる', () => {
    const c = createVoiceClipCache({ maxBytes: 2500 });
    const a = voiceClipKey(voice, 'a');
    const b = voiceClipKey(voice, 'b');
    const d = voiceClipKey(voice, 'd');
    c.put(a, 0, wav(1000));
    c.put(b, 0, wav(1000));
    c.get(a, 0); // a を使った → b がいちばん古い
    c.put(d, 0, wav(1000));
    expect(c.has(a)).toBe(true);
    expect(c.has(b)).toBe(false);
    expect(c.has(d)).toBe(true);
    expect(c.stats().bytes).toBe(2000);
  });

  it('壊れた返事(ArrayBuffer でない・ヘッダだけ・巨大)は覚えない', () => {
    const c = createVoiceClipCache();
    const k = voiceClipKey(voice, '草');
    expect(c.put(k, 0, 'x')).toBe(false);
    expect(c.put(k, 0, wav(44))).toBe(false);
    expect(c.put(k, 0, wav(10 * 1024 * 1024))).toBe(false);
    expect(c.put('', 0, wav(1000))).toBe(false);
    expect(c.stats().bytes).toBe(0);
  });

  it('同じ鍵・同じ早口を入れ直してもバイト数を二重に数えない', () => {
    const c = createVoiceClipCache();
    const k = voiceClipKey(voice, '草');
    c.put(k, 0, wav(1000));
    c.put(k, 0, wav(600));
    expect(c.stats()).toEqual({ keys: 1, bytes: 600 });
    c.clear();
    expect(c.stats()).toEqual({ keys: 0, bytes: 0 });
  });
});

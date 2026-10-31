import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNativeSpeechVoice, NATIVE_VOICE_PITCHES, nativeVoiceToneFor, silentWavDataUrl, speechTextForComment } from '../../app/live-view-native-voice.js';
import { phoneVoiceLabel } from '../../app/live-view-voice.js';

const liveView = readFileSync(new URL('../../app/live-view.js', import.meta.url), 'utf8');
const mobilePkg = JSON.parse(readFileSync(new URL('../../mobile/package.json', import.meta.url), 'utf8'));

const row = (no, text, extra = {}) => ({ no: String(no), text, name: 'そら', userId: 'a:x', ...extra });
const flush = () => new Promise((r) => setTimeout(r, 0));

function fakeCap({ plugin = true } = {}) {
  /** @type {Array<() => void>} */
  const pending = [];
  const TextToSpeech = {
    speak: vi.fn(() => new Promise((res) => { pending.push(res); })),
    stop: vi.fn(async () => {})
  };
  const cap = {
    isNativePlatform: () => true,
    isPluginAvailable: (n) => plugin && n === 'TextToSpeech',
    Plugins: plugin ? { TextToSpeech } : {}
  };
  return { cap, TextToSpeech, finishOne: () => { const f = pending.shift(); if (f) f(); } };
}

class FakeAudio {
  constructor(src) { this.src = src; this.loop = false; this.paused = true; FakeAudio.last = this; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}

beforeEach(() => { try { localStorage.removeItem('nls_phone_voice_v1'); } catch { /* node */ } });

describe('iPhone 内蔵の声の読み上げ(live-view-native-voice.js)', () => {
  it('★アプリの外・プラグインの無い古いアプリでは null(呼び出し側は PC の声を使う)', () => {
    expect(createNativeSpeechVoice({ cap: null })).toBeNull();
    expect(createNativeSpeechVoice({ cap: { isNativePlatform: () => false } })).toBeNull();
    expect(createNativeSpeechVoice({ cap: fakeCap({ plugin: false }).cap })).toBeNull();
  });

  it('★最初の1回は覚えるだけ。次から新しいコメントだけを順に読む(前の声が終わってから次)', async () => {
    const f = fakeCap();
    const v = createNativeSpeechVoice({ cap: f.cap, Audio: FakeAudio });
    expect(v.toggle()).toBe(true);
    expect(v.onRows([row(1, 'こんばんは')])).toBe(0);
    expect(f.TextToSpeech.speak).not.toHaveBeenCalled();
    expect(v.onRows([row(1, 'こんばんは'), row(2, 'わこつ'), row(3, '888')])).toBe(2);
    expect(f.TextToSpeech.speak).toHaveBeenCalledTimes(1);
    expect(f.TextToSpeech.speak.mock.calls[0][0]).toMatchObject({ text: 'わこつ', lang: 'ja-JP', queueStrategy: 1 });
    f.finishOne();
    await flush();
    expect(f.TextToSpeech.speak).toHaveBeenCalledTimes(2);
    expect(f.TextToSpeech.speak.mock.calls[1][0].text).toBe('パチパチ'); // 2026-10-28: 拍手の 8 は「パチパチ」(PC と同じ整え方)
  });

  it('★人ごとに声の高さ・速さを変える(同じ人はいつも同じ)。名前の無いコメントはふだんの声', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `a:user${i}`);
    const tones = ids.map((id) => nativeVoiceToneFor(id));
    expect(new Set(tones.map((t) => t.pitch)).size).toBeGreaterThanOrEqual(4);
    for (const t of tones) {
      expect(NATIVE_VOICE_PITCHES).toContain(t.pitch);
      expect(t.rate).toBeGreaterThanOrEqual(1.1);
      expect(t.rate).toBeLessThanOrEqual(1.2);
    }
    expect(nativeVoiceToneFor('a:user3')).toEqual(nativeVoiceToneFor('a:user3'));
    expect(nativeVoiceToneFor('')).toEqual({ pitch: 1.0, rate: 1.1 });

    const f = fakeCap();
    const v = createNativeSpeechVoice({ cap: f.cap, Audio: FakeAudio });
    v.toggle();
    v.onRows([]);
    v.onRows([row(1, 'わこつ', { userId: 'a:user7' })]);
    expect(f.TextToSpeech.speak.mock.calls[0][0]).toMatchObject(nativeVoiceToneFor('a:user7'));
  });

  it('★ギフト・本文の無い行は読まない。OFF の間は読まない(見たことだけ覚える)', () => {
    const f = fakeCap();
    const v = createNativeSpeechVoice({ cap: f.cap, Audio: FakeAudio });
    v.onRows([row(1, 'a')]);
    expect(v.onRows([row(1, 'a'), row(2, 'b')])).toBe(0);
    v.toggle();
    expect(v.onRows([row(2, 'b'), row(3, '花火', { kind: 'gift' }), row(4, '  ')])).toBe(0);
    expect(f.TextToSpeech.speak).not.toHaveBeenCalled();
  });

  it('★ON にしたら無音をくり返し鳴らす(画面を閉じても止められない)。OFF で止めて声も切る', async () => {
    const f = fakeCap();
    const v = createNativeSpeechVoice({ cap: f.cap, Audio: FakeAudio });
    v.toggle();
    await flush();
    expect(FakeAudio.last.loop).toBe(true);
    expect(FakeAudio.last.paused).toBe(false);
    expect(FakeAudio.last.src.startsWith('data:audio/wav;base64,')).toBe(true);
    expect(v.isReady()).toBe(true);
    v.toggle();
    expect(FakeAudio.last.paused).toBe(true);
    expect(f.TextToSpeech.stop).toHaveBeenCalledTimes(1);
    expect(v.isReady()).toBe(false);
  });

  it('声が鳴り始めたら番号と長さの目安を知らせる(会場の吹き出しを声に合わせる)', () => {
    const f = fakeCap();
    const v = createNativeSpeechVoice({ cap: f.cap, Audio: FakeAudio });
    const seen = [];
    v.onPlay((no, ms) => seen.push([no, ms]));
    v.toggle();
    v.onRows([]);
    v.onRows([row(5, 'こんにちは')]);
    expect(seen).toEqual([['5', 800]]);
    expect(v.pcState()).toBe('ok');
  });

  it('読む文字: URL は「リンク」・末尾の w は「わら」・長文は切る', () => {
    expect(speechTextForComment('見て https://example.com/x')).toBe('見て リンク');
    expect(speechTextForComment('それなwww')).toBe('それなわらわら');
    expect(speechTextForComment('草w')).toBe('草わら');
    const kana = (n) => Array.from({ length: n }, (_, i) => 'あいうえおかきくけこ'[i % 10]).join('');
    expect(speechTextForComment(kana(80))).toBe(`${kana(60)} 以下略`);
    expect(speechTextForComment('おめでとう88888')).toBe('おめでとうパチパチ');
    expect(speechTextForComment('   ')).toBe('');
  });

  it('無音の WAV は正しい形(RIFF/WAVE・8bit の無音)', () => {
    const b64 = silentWavDataUrl(0.01).split(',')[1];
    const bin = Buffer.from(b64, 'base64');
    expect(bin.subarray(0, 4).toString()).toBe('RIFF');
    expect(bin.subarray(8, 12).toString()).toBe('WAVE');
    expect(bin.readUInt32LE(40)).toBe(80);
    expect(bin[44]).toBe(128);
  });

  it('ボタンの文字: アプリの中は PC の VOICEVOX の案内を出さない', () => {
    const v = createNativeSpeechVoice({ cap: fakeCap().cap, Audio: FakeAudio });
    expect(phoneVoiceLabel(v).aria).toContain('iPhone の声');
    expect(phoneVoiceLabel(v).aria).not.toContain('VOICEVOX');
  });

  it('配線: アプリの中は iPhone の声を先に選び、鏡の行を渡す。プラグインは mobile の依存に入っている', () => {
    expect(liveView).toContain('_voice = createNativeSpeechVoice()\n    || createPhoneVoice(');
    expect(liveView).toContain("if (_voice && 'onRows' in _voice) _voice.onRows(restoreCommentTimelineRows(jsonBlob.commentTimelineMirror || null));");
    expect(mobilePkg.dependencies['@capacitor-community/text-to-speech']).toBeTruthy();
  });
});

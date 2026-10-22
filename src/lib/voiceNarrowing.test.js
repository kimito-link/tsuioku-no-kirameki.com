import { describe, expect, it } from 'vitest';
import {
  isWeakVoicePc,
  narrowVoiceStyleIds,
  VOICE_NARROW_STYLE_IDS
} from './voiceNarrowing.js';
import { assignVoiceForUser } from './voiceAssignment.js';
import { initializeVoicevoxSpeaker } from './voicevoxClient.js';

describe('isWeakVoicePc', () => {
  it('まだ測れていなければ弱いとみなさない(今のまま)', () => {
    expect(isWeakVoicePc({ warmSynthEmaMs: -1, coldSynthMaxMs: 0 })).toBe(false);
    expect(isWeakVoicePc({})).toBe(false);
  });
  it('自宅PC(150ms)は弱くない・ノートPC(700ms/初回7.7秒)は弱い', () => {
    expect(isWeakVoicePc({ warmSynthEmaMs: 150, coldSynthMaxMs: 900 })).toBe(false);
    expect(isWeakVoicePc({ warmSynthEmaMs: 700 })).toBe(true);
    expect(isWeakVoicePc({ warmSynthEmaMs: 300, coldSynthMaxMs: 7700 })).toBe(true);
  });
});

describe('narrowVoiceStyleIds', () => {
  const engine = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 20, 21, 23, 29, 42, 46, 47];

  it('速いPCは今の割り当てのまま(エンジンの全スタイル)', () => {
    expect(narrowVoiceStyleIds(engine, false)).toEqual(engine);
  });

  it('弱いPCは固定表の声だけ・表の順番のまま', () => {
    expect(narrowVoiceStyleIds(engine, true)).toEqual([...VOICE_NARROW_STYLE_IDS]);
  });

  it('★エンジンに声が増えても、絞った人の声は変わらない(版をまたいで固定)', () => {
    const more = [...engine, 50, 51, 52, 60, 61, 70];
    for (const user of ['a:anon1', '12345678', 'u:99', 'りんく']) {
      expect(assignVoiceForUser(user, narrowVoiceStyleIds(more, true)))
        .toEqual(assignVoiceForUser(user, narrowVoiceStyleIds(engine, true)));
    }
  });

  it('固定表の声が2つ未満しか無いエンジンでは絞らない', () => {
    expect(narrowVoiceStyleIds([3, 50, 51], true)).toEqual([3, 50, 51]);
  });

  it('固定表は変えない(変えると絞った人全員の声が変わる)', () => {
    expect(VOICE_NARROW_STYLE_IDS).toEqual([3, 2, 8, 10, 13, 14]);
    expect(Object.isFrozen(VOICE_NARROW_STYLE_IDS)).toBe(true);
  });
});

describe('initializeVoicevoxSpeaker', () => {
  it('/initialize_speaker を skip_reinit 付きで POST し、失敗しても投げない', async () => {
    const calls = [];
    const ok = await initializeVoicevoxSpeaker(8, {
      fetchFn: async (url, init) => { calls.push([url, init.method]); return { ok: true }; }
    });
    expect(ok).toBe(true);
    expect(calls).toEqual([['http://127.0.0.1:50021/initialize_speaker?speaker=8&skip_reinit=true', 'POST']]);
    expect(await initializeVoicevoxSpeaker(8, { fetchFn: async () => { throw new Error('down'); } })).toBe(false);
    expect(await initializeVoicevoxSpeaker(-1, { fetchFn: async () => ({ ok: true }) })).toBe(false);
  });
});

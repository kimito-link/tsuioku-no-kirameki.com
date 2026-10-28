import { describe, expect, it } from 'vitest';
import { isVoiceItemNgMuted, voiceNgKeySet } from './voiceNgMute.js';

describe('voiceNgMute', () => {
  const ng = voiceNgKeySet([{ key: 'u:123', name: 'A' }, { key: 'n:たろう', name: 'たろう' }, null, 'x']);

  it('NG リストの生値からキー集合を作る(壊れた値は捨てる)', () => {
    expect([...ng].sort()).toEqual(['n:たろう', 'u:123']);
    expect(voiceNgKeySet(undefined).size).toBe(0);
    expect(voiceNgKeySet({ key: 'u:1' }).size).toBe(0);
  });

  it('uid が一致する人は読まない', () => {
    expect(isVoiceItemNgMuted({ userId: '123', nickname: 'べつの名前' }, ng)).toBe(true);
    expect(isVoiceItemNgMuted({ userId: '456', nickname: 'A' }, ng)).toBe(false);
  });

  it('uid が無いときは名前で見分ける(nickname と name のどちらでも)', () => {
    expect(isVoiceItemNgMuted({ nickname: 'たろう' }, ng)).toBe(true);
    expect(isVoiceItemNgMuted({ name: 'たろう' }, ng)).toBe(true);
    expect(isVoiceItemNgMuted({ name: 'じろう' }, ng)).toBe(false);
  });

  it('NG が空・item が無いときは誰も消さない', () => {
    expect(isVoiceItemNgMuted({ userId: '123' }, new Set())).toBe(false);
    expect(isVoiceItemNgMuted(null, ng)).toBe(false);
    expect(isVoiceItemNgMuted({ userId: '123' }, null)).toBe(false);
  });
});

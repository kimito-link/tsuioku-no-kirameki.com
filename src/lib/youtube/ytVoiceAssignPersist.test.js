import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ytVoiceAssignPersistDecision, YT_VOICE_ASSIGN_PERSIST_MS } from './ytVoiceAssignPersist.js';

describe('ytVoiceAssignPersistDecision', () => {
  it('変わっていなければ書かない', () => {
    expect(ytVoiceAssignPersistDecision({ dirty: false, lastWrittenAt: 0, now: 1e9 })).toBe('none');
  });
  it('変わっていて間隔が空いていれば今書く', () => {
    expect(ytVoiceAssignPersistDecision({ dirty: true, lastWrittenAt: 0, now: YT_VOICE_ASSIGN_PERSIST_MS })).toBe('now');
  });
  it('変わっていても前の書き込みから間隔が短ければ後で', () => {
    expect(ytVoiceAssignPersistDecision({ dirty: true, lastWrittenAt: 1000, now: 1000 + YT_VOICE_ASSIGN_PERSIST_MS - 1 })).toBe('later');
  });
  it('壊れた入力でも投げない', () => {
    // @ts-expect-error
    expect(ytVoiceAssignPersistDecision(null)).toBe('none');
  });
});

describe('記録係の配線(v0.1.1968)', () => {
  const src = readFileSync(new URL('../../../extension-youtube/src/background-entry.js', import.meta.url), 'utf8');
  it('束ごとの updates に割り当てを無条件で入れていない', () => {
    expect(src).not.toMatch(/\[STORAGE_KEYS\.VOICE_ASSIGNMENTS\]: assignments,\s*\n\s*\[STORAGE_KEYS\.VOICE_QUEUE\]/);
    expect(src).toContain('ytVoiceAssignPersistDecision(');
  });
  it('控えがあるときは割り当てを storage から読み直さない', () => {
    expect(src).toMatch(/voiceAssignMem \? \[\] : \[STORAGE_KEYS\.VOICE_ASSIGNMENTS\]/);
  });
});

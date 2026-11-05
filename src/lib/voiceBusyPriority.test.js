import { describe, expect, it } from 'vitest';
import {
  classifyVoiceImportance,
  createVoiceFirstSpeakerState,
  noteVoiceSpeakerInLive,
  shouldSkipVoiceWhenBusy,
  VOICE_BUSY_QUEUE_MIN,
  VOICE_FIRST_SPEAKER_CAP,
  voicePriorityForImportance
} from './voiceBusyPriority.js';

describe('classifyVoiceImportance', () => {
  it('ギフト(kind)・ギフト本文・広告本文は大事', () => {
    expect(classifyVoiceImportance({ kind: 'gift' })).toBe('gift');
    expect(classifyVoiceImportance({ kind: 'comment', text: 'シンラツさんがギフト「応援メガホン 黄（10pt）」を贈りました' })).toBe('gift');
    expect(classifyVoiceImportance({ kind: 'comment', text: '【ニコニ広告】りんくさんが100pt広告しました' })).toBe('ad');
  });

  it('配信者本人のコメントは大事(uid 一致のときだけ)', () => {
    expect(classifyVoiceImportance({ text: 'こんばんは', userId: '123', broadcasterUid: '123' })).toBe('broadcaster');
    expect(classifyVoiceImportance({ text: 'こんばんは', userId: '124', broadcasterUid: '123' })).toBe('');
    expect(classifyVoiceImportance({ text: 'こんばんは', userId: '', broadcasterUid: '' })).toBe('');
  });

  it('モデレーターの印・その配信で初めては大事', () => {
    expect(classifyVoiceImportance({ text: 'a', isModerator: true })).toBe('moderator');
    expect(classifyVoiceImportance({ text: 'a', firstInLive: true })).toBe('first');
  });

  it('ふつうのコメント・壊れた入力は大事でない', () => {
    expect(classifyVoiceImportance({ text: 'わこつ' })).toBe('');
    expect(classifyVoiceImportance(null)).toBe('');
    expect(classifyVoiceImportance({ text: 123, isModerator: 'yes' })).toBe('');
  });
});

describe('shouldSkipVoiceWhenBusy', () => {
  it('待ちが2件以上で大事でないときだけ読まない', () => {
    expect(VOICE_BUSY_QUEUE_MIN).toBe(2);
    expect(shouldSkipVoiceWhenBusy({ queueLength: 0, importance: '' })).toBe(false);
    expect(shouldSkipVoiceWhenBusy({ queueLength: 1, importance: '' })).toBe(false);
    expect(shouldSkipVoiceWhenBusy({ queueLength: 2, importance: '' })).toBe(true);
    expect(shouldSkipVoiceWhenBusy({ queueLength: 7, importance: 'first' })).toBe(false);
    expect(shouldSkipVoiceWhenBusy({ queueLength: 7, importance: 'gift' })).toBe(false);
    expect(shouldSkipVoiceWhenBusy({ queueLength: NaN, importance: '' })).toBe(false);
  });
});

describe('voicePriorityForImportance', () => {
  it('ギフト・広告だけ前に入れる(配信者・初コメは順番を変えない)', () => {
    expect(voicePriorityForImportance('gift')).toBe('high');
    expect(voicePriorityForImportance('ad')).toBe('high');
    expect(voicePriorityForImportance('broadcaster')).toBe('normal');
    expect(voicePriorityForImportance('first')).toBe('normal');
    expect(voicePriorityForImportance('')).toBe('normal');
  });
});

describe('noteVoiceSpeakerInLive', () => {
  it('同じ配信の2回目は初めてでない・配信が変われば数え直す', () => {
    const st = createVoiceFirstSpeakerState();
    expect(noteVoiceSpeakerInLive(st, 'lv1', 'u:1')).toBe(true);
    expect(noteVoiceSpeakerInLive(st, 'lv1', 'u:1')).toBe(false);
    expect(noteVoiceSpeakerInLive(st, 'LV1', 'u:2')).toBe(true);
    expect(noteVoiceSpeakerInLive(st, 'lv2', 'u:1')).toBe(true);
  });

  it('人のキーが空なら初めてとは言わない', () => {
    const st = createVoiceFirstSpeakerState();
    expect(noteVoiceSpeakerInLive(st, 'lv1', '')).toBe(false);
    expect(noteVoiceSpeakerInLive(null, 'lv1', 'u:1')).toBe(false);
  });

  it('覚える人数は上限で有界(古い人から忘れる)', () => {
    const st = createVoiceFirstSpeakerState();
    for (let i = 0; i < VOICE_FIRST_SPEAKER_CAP + 5; i += 1) noteVoiceSpeakerInLive(st, 'lv1', `u:${i}`);
    expect(st.seen.size).toBe(VOICE_FIRST_SPEAKER_CAP);
    expect(st.seen.has('u:0')).toBe(false);
    expect(st.seen.has(`u:${VOICE_FIRST_SPEAKER_CAP + 4}`)).toBe(true);
  });
});

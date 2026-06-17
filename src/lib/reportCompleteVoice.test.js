import { describe, it, expect } from 'vitest';
import {
  REPORT_COMPLETE_VOICE_PATHS,
  REPORT_COMPLETE_VOICE_GUARD_MS,
  shouldPlayReportCompleteVoice,
  playReportCompleteVoiceSequence,
  _resetReportCompleteVoiceGuardForTest
} from './reportCompleteVoice.js';

describe('REPORT_COMPLETE_VOICE_PATHS', () => {
  it('complete を先・watch を後の順(ユーザー指定)', () => {
    expect(REPORT_COMPLETE_VOICE_PATHS[0]).toBe('sound/voice-complete.mp3');
    expect(REPORT_COMPLETE_VOICE_PATHS[1]).toBe('sound/voice-watch.mp3');
  });
});

describe('shouldPlayReportCompleteVoice (多重再生ガード)', () => {
  it('初回(last=0)は鳴らす(実時刻はガード間隔より十分大きい)', () => {
    // 実環境の now は Date.now()=巨大値なので last=0 との差は guard を必ず超える。
    expect(shouldPlayReportCompleteVoice(0, REPORT_COMPLETE_VOICE_GUARD_MS)).toBe(true);
    expect(shouldPlayReportCompleteVoice(0, 1_700_000_000_000)).toBe(true);
  });
  it('ガード間隔未満は鳴らさない', () => {
    expect(shouldPlayReportCompleteVoice(1000, 1000 + REPORT_COMPLETE_VOICE_GUARD_MS - 1)).toBe(false);
  });
  it('ガード間隔以上なら鳴らす', () => {
    expect(shouldPlayReportCompleteVoice(1000, 1000 + REPORT_COMPLETE_VOICE_GUARD_MS)).toBe(true);
  });
});

describe('playReportCompleteVoiceSequence', () => {
  it('complete→watch を順に再生する(前の ended で次へ)', () => {
    _resetReportCompleteVoiceGuardForTest();
    const played = [];
    const listeners = [];
    const audioFactory = (url) => {
      const handlers = {};
      const a = {
        url,
        volume: 0,
        addEventListener: (ev, fn) => { handlers[ev] = fn; },
        play: () => { played.push(url); return Promise.resolve(); }
      };
      listeners.push(handlers);
      return a;
    };
    playReportCompleteVoiceSequence({
      nowMs: 100000,
      audioFactory,
      getUrl: (p) => 'ext://' + p
    });
    // 1つ目(complete)が再生される
    expect(played).toEqual(['ext://sound/voice-complete.mp3']);
    // 1つ目が ended → 2つ目(watch)へ
    listeners[0].ended();
    expect(played).toEqual([
      'ext://sound/voice-complete.mp3',
      'ext://sound/voice-watch.mp3'
    ]);
  });

  it('ガード中は2回目を鳴らさない', () => {
    _resetReportCompleteVoiceGuardForTest();
    const played = [];
    const audioFactory = (url) => ({
      volume: 0,
      addEventListener: () => {},
      play: () => { played.push(url); return Promise.resolve(); }
    });
    const deps = { audioFactory, getUrl: (p) => p };
    // 1回目: last=0 との差が guard を超える実時刻で発火。
    playReportCompleteVoiceSequence({ ...deps, nowMs: 1_700_000_000_000 });
    // 2回目: 直後(ガード中)=鳴らさない。
    playReportCompleteVoiceSequence({ ...deps, nowMs: 1_700_000_001_000 });
    expect(played).toEqual(['sound/voice-complete.mp3']); // 1回ぶんだけ
  });

  it('play が reject しても例外を投げず次へ進む(保存の成否に影響させない)', () => {
    _resetReportCompleteVoiceGuardForTest();
    const played = [];
    const listeners = [];
    const audioFactory = (url) => {
      const handlers = {};
      listeners.push(handlers);
      return {
        volume: 0,
        addEventListener: (ev, fn) => { handlers[ev] = fn; },
        play: () => { played.push(url); return Promise.reject(new Error('blocked')); }
      };
    };
    expect(() =>
      playReportCompleteVoiceSequence({ nowMs: 200000, audioFactory, getUrl: (p) => p })
    ).not.toThrow();
    expect(played[0]).toBe('sound/voice-complete.mp3');
  });
});

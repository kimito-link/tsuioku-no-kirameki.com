import { describe, expect, it } from 'vitest';
import {
  makeInitialVoiceEffectDiag,
  voiceSkipFieldForGateReason,
  buildVoiceEffectDiagSnapshot,
  buildVoiceEffectDiagLines
} from './voiceEffectDiag.js';

describe('makeInitialVoiceEffectDiag', () => {
  it('全カウンタ0・soundEnabled=true の初期値', () => {
    const d = makeInitialVoiceEffectDiag();
    expect(d.fired).toBe(0);
    expect(d.skippedCooldown).toBe(0);
    expect(d.skippedCap).toBe(0);
    expect(d.skippedNarrating).toBe(0);
    expect(d.skippedVenue).toBe(0);
    expect(d.skippedUnassigned).toBe(0);
    expect(d.soundEnabled).toBe(true);
    expect(d.lastKey).toBe('');
    expect(d.lastEventAt).toBe(0);
  });
});

describe('voiceSkipFieldForGateReason', () => {
  it('cooldown/global_cooldown → skippedCooldown', () => {
    expect(voiceSkipFieldForGateReason('cooldown')).toBe('skippedCooldown');
    expect(voiceSkipFieldForGateReason('global_cooldown')).toBe('skippedCooldown');
  });
  it('cap/global_cap → skippedCap', () => {
    expect(voiceSkipFieldForGateReason('cap')).toBe('skippedCap');
    expect(voiceSkipFieldForGateReason('global_cap')).toBe('skippedCap');
  });
  it('narrating → skippedNarrating', () => {
    expect(voiceSkipFieldForGateReason('narrating')).toBe('skippedNarrating');
  });
  it('未知のreasonはnull(数えない)', () => {
    expect(voiceSkipFieldForGateReason('unknown_key')).toBeNull();
    expect(voiceSkipFieldForGateReason('')).toBeNull();
    expect(voiceSkipFieldForGateReason(undefined)).toBeNull();
  });
});

describe('buildVoiceEffectDiagSnapshot', () => {
  it('欠損フィールドは初期値で埋める', () => {
    const snap = buildVoiceEffectDiagSnapshot({ fired: 3 }, 5000);
    expect(snap.fired).toBe(3);
    expect(snap.skippedCooldown).toBe(0);
    expect(snap.soundEnabled).toBe(true);
    expect(snap.capturedAt).toBe(5000);
  });
  it('null入力でも初期値スナップショットを返す', () => {
    const snap = buildVoiceEffectDiagSnapshot(null, 1);
    expect(snap.fired).toBe(0);
    expect(snap.capturedAt).toBe(1);
  });
  it('soundEnabled=false を保持する', () => {
    const snap = buildVoiceEffectDiagSnapshot({ soundEnabled: false }, 1);
    expect(snap.soundEnabled).toBe(false);
  });
});

describe('buildVoiceEffectDiagLines', () => {
  it('未観測(全カウンタ0)なら空配列=行を出さない', () => {
    expect(buildVoiceEffectDiagLines(makeInitialVoiceEffectDiag(), 1000)).toEqual([]);
    expect(buildVoiceEffectDiagLines(null, 1000)).toEqual([]);
  });

  it('発火があれば2行(概要+内訳)を出す', () => {
    const snap = buildVoiceEffectDiagSnapshot(
      { fired: 2, skippedCooldown: 5, skippedCap: 1, skippedNarrating: 3, lastKey: 'voice_kamitsumi', lastEventAt: 9_000 },
      10_000
    );
    const lines = buildVoiceEffectDiagLines(snap, 10_000);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('パチンコボイス');
    expect(lines[0]).toContain('ON');
    expect(lines[0]).toContain('最終1秒前');
    expect(lines[0]).toContain('voice_kamitsumi');
    expect(lines[1]).toContain('発火2');
    expect(lines[1]).toContain('CD:5');
    expect(lines[1]).toContain('上限:1');
    expect(lines[1]).toContain('読み上げ中:3');
  });

  it('スキップだけ(発火0)でも行を出す=歯止めが働いた証拠を見せる', () => {
    const snap = buildVoiceEffectDiagSnapshot({ skippedCooldown: 4 }, 1000);
    const lines = buildVoiceEffectDiagLines(snap, 1000);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('発火0');
    expect(lines[1]).toContain('CD:4');
  });

  it('会場優先スキップは発生時のみ内訳に出す', () => {
    const without = buildVoiceEffectDiagLines(buildVoiceEffectDiagSnapshot({ fired: 1 }, 1), 1);
    expect(without[1]).not.toContain('会場優先');
    const withVenue = buildVoiceEffectDiagLines(buildVoiceEffectDiagSnapshot({ fired: 1, skippedVenue: 2 }, 1), 1);
    expect(withVenue[1]).toContain('会場優先:2');
  });

  it('効果音OFFはOFFとして表示する(誤診断防止)', () => {
    const snap = buildVoiceEffectDiagSnapshot({ fired: 1, soundEnabled: false }, 1);
    const lines = buildVoiceEffectDiagLines(snap, 1);
    expect(lines[0]).toContain('OFF');
  });

  // 修正1: 未割当は「一度も鳴っていないのにCDスキップ」という嘘を防ぐため常に内訳へ表示する。
  it('未割当が有る時は内訳に「未割当:N」を出す(発火0でも未観測扱いにしない)', () => {
    const snap = buildVoiceEffectDiagSnapshot({ skippedUnassigned: 30 }, 1000);
    const lines = buildVoiceEffectDiagLines(snap, 1000);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('発火0');
    expect(lines[1]).toContain('未割当:30');
  });

  it('未割当が0の時も「未割当:0」を明記する(嘘をつかない=省略しない)', () => {
    const snap = buildVoiceEffectDiagSnapshot({ fired: 2 }, 1000);
    const lines = buildVoiceEffectDiagLines(snap, 1000);
    expect(lines[1]).toContain('未割当:0');
  });
});

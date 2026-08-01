import { describe, expect, it } from 'vitest';
import {
  VOICE_SYNTH_TIMEOUT_MS,
  classifyVoiceSynthNull,
  formatVoiceSynthFailureLine
} from './voiceSynthFailure.js';

/**
 * 2026-08-01 実配信(lv351072048)で読み上げが破綻したが、計器の帳尻が合わなかった:
 *   1分に約52件届いて、読めた約6件 + 間引き12件 = 18件しか説明できず、約34件が行方不明。
 * 合成が null で返った件を voicePlayer が黙って捨てていたのが真犯人。
 */
describe('classifyVoiceSynthNull', () => {
  it('タイムアウト上限ちょうどは時間切れ扱い', () => {
    expect(classifyVoiceSynthNull({ synthMs: VOICE_SYNTH_TIMEOUT_MS }).nearTimeout).toBe(true);
  });

  it('実測の合成待ち8599msは時間切れ由来を疑う(上限8000msを超えている)', () => {
    const v = classifyVoiceSynthNull({ synthMs: 8599 });
    expect(v.nearTimeout).toBe(true);
    expect(v.ratio).toBeGreaterThan(1);
  });

  it('上限の9割以上なら時間切れ側に寄せる(境界)', () => {
    expect(classifyVoiceSynthNull({ synthMs: 7200 }).nearTimeout).toBe(true); // 90%
    expect(classifyVoiceSynthNull({ synthMs: 7199 }).nearTimeout).toBe(false);
  });

  it('速い失敗は時間切れではない(VOICEVOX未起動・接続拒否など別原因)', () => {
    expect(classifyVoiceSynthNull({ synthMs: 12 }).nearTimeout).toBe(false);
    expect(classifyVoiceSynthNull({ synthMs: 0 }).nearTimeout).toBe(false);
  });

  it('上限を明示できる(既定は8000ms=voicevoxClientと揃える)', () => {
    expect(classifyVoiceSynthNull({ synthMs: 2700, timeoutMs: 3000 }).nearTimeout).toBe(true);
    expect(classifyVoiceSynthNull({ synthMs: 2700 }).nearTimeout).toBe(false);
  });

  it('計測できていなければ時間切れと断定しない(嘘の分類をしない)', () => {
    expect(classifyVoiceSynthNull({ synthMs: NaN }).nearTimeout).toBe(false);
    expect(classifyVoiceSynthNull({ synthMs: -1 }).ratio).toBe(-1);
    expect(classifyVoiceSynthNull({}).nearTimeout).toBe(false);
    expect(classifyVoiceSynthNull().nearTimeout).toBe(false);
  });
});

describe('formatVoiceSynthFailureLine', () => {
  it('失敗0件なら何も出さない(静かな計器)', () => {
    expect(formatVoiceSynthFailureLine({ synthNullTotal: 0 })).toBe('');
    expect(formatVoiceSynthFailureLine({})).toBe('');
    expect(formatVoiceSynthFailureLine()).toBe('');
  });

  it('失敗があれば必ず内訳まで出す(行方不明を作らない)', () => {
    const line = formatVoiceSynthFailureLine({ synthNullTotal: 34, synthNullNearTimeout: 30 });
    expect(line).toContain('合成失敗34件');
    expect(line).toContain('時間切れ30');
    expect(line).toContain('その他4');
  });

  it('内訳が総数を超えても負の数を出さない', () => {
    const line = formatVoiceSynthFailureLine({ synthNullTotal: 5, synthNullNearTimeout: 9 });
    expect(line).toContain('その他0');
    expect(line).not.toContain('-');
  });
});

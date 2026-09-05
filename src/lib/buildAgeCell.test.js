/**
 * buildAgeCell.test.js — ビルドの古さが正しく出るか。
 *
 * ★NL_BUILD_ID は `MMDD-HHmmss` で **年が入っていない**。
 *   年またぎで誤診すると「1月1日に364日前のビルド」と嘘をつき、
 *   ユーザーを間違った方向(反映されていない疑い)へ誘導する=価値が負。
 *   ここを test で固定する。
 */
import { describe, it, expect } from 'vitest';
import { buildAgeMs, buildBuildAgeCell } from './buildAgeCell.js';

/** JST の日時から epoch ms を作る。 */
function jst(y, mo, d, h, mi, s) {
  return Date.UTC(y, mo - 1, d, h, mi, s) - 9 * 60 * 60 * 1000;
}

describe('ビルドの古さ', () => {
  it('同日のビルドは分単位で出る', () => {
    const now = jst(2026, 8, 15, 21, 0, 0);
    expect(buildAgeMs('0815-204834', now)).toBe(now - jst(2026, 8, 15, 20, 48, 34));
  });

  it('★年またぎ: 1月に12月のビルドを読んでも「未来」にしない', () => {
    // 2027-01-02 に 12/30 のビルド(=前年)を読む
    const now = jst(2027, 1, 2, 10, 0, 0);
    const age = buildAgeMs('1230-120000', now);
    expect(age).not.toBeNull();
    // 約3日前(364日前ではない)
    const days = (age ?? 0) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(2.5);
    expect(days).toBeLessThan(3.5);
  });

  it('★タイムゾーンに依存しない(JST固定で解釈する)', () => {
    // 同じ瞬間・同じ buildId なら、実行環境のTZに関係なく同じ値
    const now = jst(2026, 8, 15, 21, 0, 0);
    const a = buildAgeMs('0815-204834', now);
    expect(a).toBe(11 * 60 * 1000 + 26 * 1000);
  });

  it('読めない buildId は null', () => {
    expect(buildAgeMs('', Date.now())).toBeNull();
    expect(buildAgeMs('不明', Date.now())).toBeNull();
    expect(buildAgeMs('815-2048', Date.now())).toBeNull();
  });

  describe('セル', () => {
    it('★当日のビルドは ok(責めない)', () => {
      const now = jst(2026, 8, 15, 21, 0, 0);
      const c = buildBuildAgeCell({ buildId: '0815-204834', version: '0.1.1404', nowMs: now });
      expect(c.level).toBe('ok');
      expect(c.text).toContain('v0.1.1404');
    });

    it('★3日以上前は bad +「反映されていない可能性」', () => {
      const now = jst(2026, 8, 15, 21, 0, 0);
      const c = buildBuildAgeCell({ buildId: '0807-120000', version: '0.1.1283', nowMs: now });
      expect(c.level).toBe('bad');
      expect(c.text).toContain('日前');
      // 2026-08-14 の事件(8日前の版が実機に残っていた)を1行で終わらせる文言
      expect(c.text).toContain('反映されていない');
    });

    it('1日〜3日前は warn', () => {
      const now = jst(2026, 8, 15, 21, 0, 0);
      const c = buildBuildAgeCell({ buildId: '0814-120000', version: '0.1.1400', nowMs: now });
      expect(c.level).toBe('warn');
    });

    it('読めなければ na(嘘をつかない)', () => {
      const c = buildBuildAgeCell({ buildId: '', nowMs: Date.now() });
      expect(c.level).toBe('na');
      expect(c.text).toBe('—');
    });
  });
});

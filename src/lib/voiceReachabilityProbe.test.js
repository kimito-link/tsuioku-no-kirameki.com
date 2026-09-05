import { describe, it, expect } from 'vitest';
import { judgeVoiceReachability, VOICE_REACH_FRESH_MS } from './voiceReachabilityProbe.js';

/*
 * ★v0.1.1330: 会議(4体・全員一致)の保証目標
 *   「真因特定までの往復回数を1回にする」を、この1行で実現できるかを固定する。
 *
 *   2026-08-11 に実際に起きたこと: 読み上げの修正を3版出したのに、
 *   状態速報は毎回「化石値」しか出さず、効いたかどうかが分からなかった。
 *   原因は【面を開いていないと計器が書かれない】こと。
 *   その「開いていないのか/開いているのに壊れているのか」を分けるのがこの判定。
 */

describe('judgeVoiceReachability', () => {
  it('★面が開いていない = 鳴らなくて当然。次にやることを名指しする', () => {
    const r = judgeVoiceReachability({
      venueOpen: false,
      diagAgeMs: 8 * 24 * 60 * 60 * 1000, // 8日前(実際に出ていた化石)
      diagSource: 'venue'
    });
    expect(r.state).toBe('no-surface');
    expect(r.line).toContain('開いていません');
    expect(r.line).toContain('会場モード'); // 次の行動を書く
    // ★「不具合」と誤解させない(これが原因で3版空振りした)
    expect(r.line).not.toContain('不具合');
  });

  it('★会場は開いているのに計器が古い = ここで初めて「不具合」と言える', () => {
    const r = judgeVoiceReachability({
      venueOpen: true,
      diagAgeMs: 30 * 60 * 1000,
      diagSource: 'venue',
      diagEnabled: true
    });
    expect(r.state).toBe('stale-surface');
    expect(r.line).toContain('会場は開いているのに');
    expect(r.line).toContain('不具合');
    expect(r.line).toContain('最後はONでした');
  });

  it('計器が新鮮 = 稼働中(中身の判定は既存の voiceDiag に任せる)', () => {
    const r = judgeVoiceReachability({
      venueOpen: true,
      diagAgeMs: 5_000,
      diagSource: 'comeview'
    });
    expect(r.state).toBe('live');
    expect(r.line).toContain('稼働中');
    expect(r.line).toContain('comeview'); // どちらの実装かを出す
  });

  it('★面が閉じていても計器が新鮮なら稼働中を優先(コメビュ別窓は venueOpen=false のため)', () => {
    // コメビュは別ウィンドウ=watch ページの html クラスは立たない。
    // 「開いていない」と誤判定すると、動いているのに止まっていると言ってしまう。
    const r = judgeVoiceReachability({
      venueOpen: false,
      diagAgeMs: 3_000,
      diagSource: 'comeview'
    });
    expect(r.state).toBe('live');
  });

  it('しきい値の境界(60秒)', () => {
    const inside = judgeVoiceReachability({
      venueOpen: true, diagAgeMs: VOICE_REACH_FRESH_MS - 1
    });
    expect(inside.state).toBe('live');
    const outside = judgeVoiceReachability({
      venueOpen: true, diagAgeMs: VOICE_REACH_FRESH_MS + 1
    });
    expect(outside.state).toBe('stale-surface');
  });

  it('計器が一度も書かれていない + 会場は開いている = 起動直後の可能性を示す', () => {
    const r = judgeVoiceReachability({ venueOpen: true, diagAgeMs: -1 });
    expect(r.state).toBe('unknown');
    expect(r.line).toContain('起動直後');
  });

  it('壊れた入力でも例外を投げない', () => {
    expect(() => judgeVoiceReachability(/** @type {any} */ (null))).not.toThrow();
    expect(() => judgeVoiceReachability(/** @type {any} */ (undefined))).not.toThrow();
    expect(judgeVoiceReachability({}).state).toBe('no-surface');
  });
});

import { describe, expect, it } from 'vitest';
import { summarizeEventLoopStall, EVENT_LOOP_STALL_MS } from './eventLoopStallSummary.js';

/**
 * ★v0.1.1381: 「予定 vs 実発火」からイベントループ停止を言う純関数の単体テスト。
 *
 * ★実機の再現(2026-08-12・黒画面7版が外れ続けた真因)を必ず1本入れる:
 *   予定 12000ms のサンプルが 14574ms に発火 = 2574ms の停止。
 *   [[prove-fix-by-replaying-old-code-2026-08-09]] と同じ発想で、
 *   実際に観測された値をテストに焼き付けて「この値をこう読む」を固定する。
 */
describe('summarizeEventLoopStall', () => {
  it('★実機の値(予定12000ms→実発火14574ms)を「停止2574ms」と読む', () => {
    const r = summarizeEventLoopStall([
      { t: 0, sched: 0 },
      { t: 62, sched: 60 },
      { t: 14574, sched: 12000 }
    ]);
    expect(r.maxDelayMs).toBe(2574);
    expect(r.maxDelayAtSchedMs).toBe(12000);
    expect(r.stalled).toBe(true);
    // ★次の一手まで言う(読んで直せない計器は価値が低い)。
    expect(r.line).toContain('イベントループ停止');
    expect(r.line).toContain('描画側を直しても消えない');
  });

  it('健全なら✅で、描画側を詰めてよいと分かる', () => {
    const r = summarizeEventLoopStall([
      { t: 3, sched: 0 },
      { t: 65, sched: 60 },
      { t: 210, sched: 200 }
    ]);
    expect(r.maxDelayMs).toBe(10);
    expect(r.stalled).toBe(false);
    expect(r.line).toContain('✅');
  });

  it('★予定を持たない点(load/visible/reload)は数えない=遅延0と嘘をつかない', () => {
    // sched が無い点しか無ければ「未観測」であって「遅延なし」ではない。
    const r = summarizeEventLoopStall([
      { t: 14778, sched: null },
      { t: 20000 }
    ]);
    expect(r.observed).toBe(0);
    expect(r.stalled).toBe(false);
    expect(r.line).toContain('未観測');
    // ★「✅健全」と言ってはいけない(測っていないだけ)。
    expect(r.line).not.toContain('✅');
  });

  it('空/不正入力でも落ちない(best-effort の計器)', () => {
    expect(summarizeEventLoopStall(null).observed).toBe(0);
    expect(summarizeEventLoopStall([null, 'x', { t: -1, sched: 0 }]).observed).toBe(0);
  });

  it('★境目は1000ms(hidden タブの間引きでは説明が付かない長さ)', () => {
    expect(EVENT_LOOP_STALL_MS).toBe(1000);
    // 遅延ちょうど1000ms=停止と呼ぶ / 999ms=呼ばない。
    expect(summarizeEventLoopStall([{ t: 2000, sched: 1000 }]).stalled).toBe(true);
    expect(summarizeEventLoopStall([{ t: 1999, sched: 1000 }]).stalled).toBe(false);
  });

  it('実発火が予定より早くても負の遅延にしない', () => {
    const r = summarizeEventLoopStall([{ t: 90, sched: 100 }]);
    expect(r.maxDelayMs).toBe(0);
    expect(r.stalled).toBe(false);
  });
});

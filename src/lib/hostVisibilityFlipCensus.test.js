import { describe, expect, it } from 'vitest';
import {
  createHostVisibilityFlipCensus,
  formatHostVisibilityFlipLine,
  judgeHostFlipPeriodicity,
  noteHostHidden,
  noteHostShown,
  snapshotHostVisibilityFlipCensus
} from './hostVisibilityFlipCensus.js';

/** 実測(2026-08-04 の画面録画)を再現: 4.000秒ごとに33msだけ消える。 */
function replayRecordedSymptom(c, { count = 4, cause = 'live_poll_4000ms' } = {}) {
  for (let i = 0; i < count; i += 1) {
    const at = 10_000 + i * 4000;
    noteHostHidden(c, { cause, nowMs: at });
    noteHostShown(c, { nowMs: at + 33 });
  }
}

describe('hostVisibilityFlipCensus', () => {
  it('消えた/戻ったを数え、1フレームだけの消失を別勘定する', () => {
    const c = createHostVisibilityFlipCensus();
    noteHostHidden(c, { cause: 'x', nowMs: 1000 });
    noteHostShown(c, { nowMs: 1033 }); // 33ms=1フレーム
    noteHostHidden(c, { cause: 'x', nowMs: 5000 });
    noteHostShown(c, { nowMs: 6500 }); // 1.5秒=1フレームではない
    const s = snapshotHostVisibilityFlipCensus(c);
    expect(s.hideCount).toBe(2);
    expect(s.showCount).toBe(2);
    expect(s.oneFrameHideCount).toBe(1);
  });

  it('★実測の症状(4秒ごと33ms)を「周期あり」と断言できる', () => {
    const c = createHostVisibilityFlipCensus();
    replayRecordedSymptom(c);
    const v = judgeHostFlipPeriodicity(c);
    expect(v.periodic).toBe(true);
    expect(v.periodMs).toBe(4000);
    const line = formatHostVisibilityFlipLine(c);
    expect(line).toContain('4.0秒ちょうどの周期');
    expect(line).toContain('タイマーが原因');
    expect(line).toContain('live_poll_4000ms');
  });

  it('★間隔がばらつくときは周期と誤報しない', () => {
    const c = createHostVisibilityFlipCensus();
    const gaps = [400, 3200, 900, 7000];
    let t = 1000;
    for (const g of gaps) {
      noteHostHidden(c, { cause: 'y', nowMs: t });
      noteHostShown(c, { nowMs: t + 20 });
      t += g;
    }
    const v = judgeHostFlipPeriodicity(c);
    expect(v.periodic).toBe(false);
    expect(v.reason).toBe('irregular');
    expect(formatHostVisibilityFlipLine(c)).not.toContain('ちょうどの周期');
  });

  it('★件数が足りなければ判定を出さない(偶発を周期と言わない)', () => {
    const c = createHostVisibilityFlipCensus();
    noteHostHidden(c, { cause: 'z', nowMs: 1000 });
    noteHostShown(c, { nowMs: 1033 });
    const v = judgeHostFlipPeriodicity(c);
    expect(v.periodic).toBe(false);
    expect(v.reason).toBe('too-few');
  });

  it('★犯人が支配的なら名指しする', () => {
    const c = createHostVisibilityFlipCensus();
    replayRecordedSymptom(c, { count: 5, cause: 'live_poll_4000ms' });
    noteHostHidden(c, { cause: 'other', nowMs: 99_000 });
    noteHostShown(c, { nowMs: 99_030 });
    const line = formatHostVisibilityFlipLine(c);
    expect(line).toContain('犯人: live_poll_4000ms');
    expect(line).toMatch(/8[0-9]%|9[0-9]%/);
  });

  it('消えていなければ明示的に正常と出す(無言で黙らない)', () => {
    const c = createHostVisibilityFlipCensus();
    expect(formatHostVisibilityFlipLine(c)).toContain('✅ 観測されていません');
  });

  it('★二重通知で水増ししない(消えている間の再通知は無視)', () => {
    const c = createHostVisibilityFlipCensus();
    noteHostHidden(c, { cause: 'a', nowMs: 1000 });
    noteHostHidden(c, { cause: 'a', nowMs: 1010 }); // 既に消えている
    noteHostShown(c, { nowMs: 1033 });
    noteHostShown(c, { nowMs: 1040 }); // 既に戻っている
    const s = snapshotHostVisibilityFlipCensus(c);
    expect(s.hideCount).toBe(1);
    expect(s.showCount).toBe(1);
  });

  it('壊れた入力でも例外を投げない(計器は描画を止めない)', () => {
    expect(() => noteHostHidden(null, {})).not.toThrow();
    expect(() => noteHostShown(undefined, {})).not.toThrow();
    expect(snapshotHostVisibilityFlipCensus(null)).toBeNull();
    const c = createHostVisibilityFlipCensus();
    expect(() => noteHostHidden(c, null)).not.toThrow();
    expect(snapshotHostVisibilityFlipCensus(c).byCause.unknown).toBe(1);
  });
});

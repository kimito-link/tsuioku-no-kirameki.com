import { describe, it, expect } from 'vitest';
import {
  createHostVisibilityWatch,
  noteHostFrame,
  isRectVisible,
  classifyCollapse,
  analyzeVanishPeriod,
  snapshotHostVisibilityWatch,
  formatHostVisibilityWatchLine
} from './hostVisibilityWatch.js';

const big = { w: 920, h: 600 };

/** n フレーム分、見えている状態を流す。 */
function feedVisible(watch, n, startMs = 0, stepMs = 33) {
  for (let i = 0; i < n; i += 1) {
    noteHostFrame(watch, { nowMs: startMs + i * stepMs, rect: big });
  }
}

describe('isRectVisible / classifyCollapse', () => {
  it('十分大きければ見えている', () => {
    expect(isRectVisible(big)).toBe(true);
  });

  it('★録画で観測した「幅920→11」を不可視と判定する(displayは見ない)', () => {
    expect(isRectVisible({ w: 11, h: 600 })).toBe(false);
  });

  it('高さだけ潰れた場合も不可視(prevH600→nowH0 の実測パターン)', () => {
    expect(isRectVisible({ w: 920, h: 0 })).toBe(false);
  });

  it('どの軸が潰れたかを名指しする', () => {
    expect(classifyCollapse(big, { w: 11, h: 600 })).toBe('width');
    expect(classifyCollapse(big, { w: 920, h: 0 })).toBe('height');
    expect(classifyCollapse(big, { w: 0, h: 0 })).toBe('both');
  });
});

describe('noteHostFrame — 消失を捕らえる', () => {
  it('★1フレームだけ消えて戻る(ちらつき)を1件として数える', () => {
    const w = createHostVisibilityWatch();
    feedVisible(w, 5);
    noteHostFrame(w, { nowMs: 165, rect: { w: 11, h: 600 } }); // 消失
    noteHostFrame(w, { nowMs: 198, rect: big }); // 復帰
    const s = snapshotHostVisibilityWatch(w);
    expect(s.vanishCount).toBe(1);
    expect(s.oneFrameVanishCount).toBe(1);
  });

  it('消えたままなら oneFrame では数えず、継続フレーム数を記録する', () => {
    const w = createHostVisibilityWatch();
    feedVisible(w, 3);
    for (let i = 0; i < 10; i += 1) noteHostFrame(w, { nowMs: 100 + i * 33, rect: { w: 0, h: 0 } });
    const s = snapshotHostVisibilityWatch(w);
    expect(s.vanishCount).toBe(1);
    expect(s.oneFrameVanishCount).toBe(0);
    expect(s.maxHiddenFrames).toBeGreaterThanOrEqual(10);
    expect(s.currentlyHidden).toBe(true);
  });

  it('見えている間は何も計上しない(水増ししない)', () => {
    const w = createHostVisibilityWatch();
    feedVisible(w, 100);
    const s = snapshotHostVisibilityWatch(w);
    expect(s.vanishCount).toBe(0);
    expect(s.frames).toBe(100);
  });

  it('消失の瞬間の寸法と computed 値を記録する(原因の材料)', () => {
    const w = createHostVisibilityWatch();
    feedVisible(w, 3);
    noteHostFrame(w, {
      nowMs: 200,
      rect: { w: 920, h: 0 },
      display: 'none',
      visibility: 'visible',
      opacity: '1',
      connected: true,
      parentTag: 'DIV'
    });
    const s = snapshotHostVisibilityWatch(w);
    expect(s.samples[0]).toMatchObject({
      prevW: 920, prevH: 600, nowW: 920, nowH: 0, axis: 'height', display: 'none'
    });
  });

  it('サンプルは上限で頭打ちになる(速報を膨らませない)', () => {
    const w = createHostVisibilityWatch();
    for (let i = 0; i < 30; i += 1) {
      feedVisible(w, 2, i * 1000);
      noteHostFrame(w, { nowMs: i * 1000 + 66, rect: { w: 0, h: 0 } });
    }
    expect(snapshotHostVisibilityWatch(w).samples.length).toBeLessThanOrEqual(8);
  });
});

describe('analyzeVanishPeriod — タイマー由来かを断言する', () => {
  it('★4秒ちょうどの等間隔なら periodic=true(録画の実測パターン)', () => {
    const r = analyzeVanishPeriod([4000, 4000, 3999, 4001]);
    expect(r.periodic).toBe(true);
    expect(r.periodMs).toBe(4000);
  });

  it('ばらつく間隔は周期と呼ばない(誤報しない)', () => {
    expect(analyzeVanishPeriod([1200, 5300, 800, 9100]).periodic).toBe(false);
  });

  it('サンプルが足りなければ判定しない', () => {
    expect(analyzeVanishPeriod([4000]).periodic).toBe(false);
    expect(analyzeVanishPeriod([]).cv).toBe(-1);
  });
});

describe('formatHostVisibilityWatchLine — 0の意味を区別する', () => {
  it('★観測フレームが少なければ「未計測」と言う(起動直後の0を緑と誤読しない)', () => {
    const line = formatHostVisibilityWatchLine({ frames: 12, vanishCount: 0, samples: [] });
    expect(line).toContain('未計測');
    expect(line).not.toContain('✅');
  });

  it('十分観測して消失0なら ✅ かつフレーム数を併記する', () => {
    const line = formatHostVisibilityWatchLine({ frames: 900, vanishCount: 0, samples: [] });
    expect(line).toContain('✅');
    expect(line).toContain('900フレーム');
  });

  it('周期的なら「タイマーが原因」と断言する', () => {
    const line = formatHostVisibilityWatchLine({
      frames: 900, vanishCount: 5, oneFrameVanishCount: 5,
      periodic: true, periodMs: 4000, cv: 0.01,
      samples: [{ prevW: 920, prevH: 600, nowW: 11, nowH: 600, axis: 'width', display: 'block' }]
    });
    expect(line).toContain('4.0秒ちょうどの周期');
    expect(line).toContain('タイマーが原因');
    expect(line).toContain('幅が潰れた');
  });

  it('DOMから外れていたらそれを名指しする', () => {
    const line = formatHostVisibilityWatchLine({
      frames: 900, vanishCount: 1, oneFrameVanishCount: 0,
      samples: [{ prevW: 920, prevH: 600, nowW: 0, nowH: 0, axis: 'both', connected: false }]
    });
    expect(line).toContain('DOMから外れています');
  });

  it('材料が無ければ空文字(速報を壊さない)', () => {
    expect(formatHostVisibilityWatchLine(null)).toBe('');
  });
});

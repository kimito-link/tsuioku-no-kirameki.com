import { describe, it, expect } from 'vitest';
import {
  createVanishForensics, markTrail, recentTrail, noteVanishWithTrail,
  snapshotVanishForensics, formatVanishForensicsLine, TRAIL_MAX, POLL_DELTA_MAX
} from './hostVanishForensics.js';

/**
 * v0.1.1267 追加分: hint / snapshot / pollDelta。
 * ★位相判定に要る Δ は samples 上限(4件)と別勘定であることを固定する。
 *   ここが同勘定だと、5回目以降の消失で Δ が貯まらず永久に insufficient になる。
 */
describe('v0.1.1267 — hint / snapshot / pollDelta', () => {
  it('★Δは samples 上限(4件)を超えても貯まり続ける(位相判定を殺さない)', () => {
    const f = createVanishForensics();
    for (let i = 0; i < 6; i += 1) {
      noteVanishWithTrail(f, { nowMs: 1000 + i, pollDeltaMs: 100 + i });
    }
    expect(f.samples.length).toBe(4);        // サンプルは打ち切る
    expect(f.pollDeltas.length).toBe(6);     // Δは貯まる
    expect(f.vanishCount).toBe(6);
  });

  it(`Δの保持上限は ${POLL_DELTA_MAX} 件(古い方から捨てる)`, () => {
    const f = createVanishForensics();
    for (let i = 0; i < POLL_DELTA_MAX + 3; i += 1) {
      noteVanishWithTrail(f, { nowMs: i, pollDeltaMs: i });
    }
    expect(f.pollDeltas.length).toBe(POLL_DELTA_MAX);
    expect(f.pollDeltas[POLL_DELTA_MAX - 1]).toBe(POLL_DELTA_MAX + 2);
  });

  it('★数値でない Δ は積まない(欠損が0msとして位相に混ざらない)', () => {
    const f = createVanishForensics();
    noteVanishWithTrail(f, { nowMs: 1, pollDeltaMs: null });
    noteVanishWithTrail(f, { nowMs: 2 });
    noteVanishWithTrail(f, { nowMs: 3, pollDeltaMs: 42 });
    expect(f.pollDeltas).toEqual([42]);
    expect(f.samples[0].pollDeltaMs).toBe(null);
  });

  it('hint / detail / snapshot が sample に残る', () => {
    const f = createVanishForensics();
    noteVanishWithTrail(f, {
      nowMs: 10, w: 0, h: 0, display: 'none',
      hint: 'style-wiped', detail: 'inline display lost',
      snapshot: { styleAttr: 'width:100%', ancestors: [{ tag: 'DIV', display: 'block', w: 933, h: 600 }] },
      pollDeltaMs: 1832
    });
    const s = f.samples[0];
    expect(s.hint).toBe('style-wiped');
    expect(s.detail).toBe('inline display lost');
    expect(s.snapshot.styleAttr).toBe('width:100%');
    expect(s.pollDeltaMs).toBe(1832);
  });

  it('★速報の行に hint と Δ と祖先が出る(ユーザーが読む行)', () => {
    const f = createVanishForensics();
    markTrail(f, 'render', 9);
    noteVanishWithTrail(f, {
      nowMs: 10, w: 0, h: 0, display: 'none',
      hint: 'ancestor-collapsed', detail: 'ancestor[1] SECTION display:none',
      snapshot: {
        styleAttr: 'display:block',
        ancestors: [
          { tag: 'DIV', display: 'block', w: 933, h: 600 },
          { tag: 'SECTION', display: 'none', w: 0, h: 0 }
        ]
      },
      pollDeltaMs: 1832
    });
    const line = formatVanishForensicsLine(snapshotVanishForensics(f));
    expect(line).toContain('hint:ancestor-collapsed');
    expect(line).toContain('Δpoll:+1832ms');
    expect(line).toContain('SECTION');
    expect(line).toContain('理由: ancestor[1] SECTION display:none');
  });

  it('hint が無いときは「未分類」と明記する(空欄で誤読させない)', () => {
    const f = createVanishForensics();
    markTrail(f, 'render', 9);
    noteVanishWithTrail(f, { nowMs: 10, w: 0, h: 0, display: 'none' });
    expect(formatVanishForensicsLine(snapshotVanishForensics(f))).toContain('hint:(未分類)');
  });

  it('snapshot に pollDeltas が載る(位相判定の入力)', () => {
    const f = createVanishForensics();
    noteVanishWithTrail(f, { nowMs: 1, pollDeltaMs: 100 });
    noteVanishWithTrail(f, { nowMs: 2, pollDeltaMs: 110 });
    expect(snapshotVanishForensics(f).pollDeltas).toEqual([100, 110]);
  });
});

describe('markTrail / recentTrail', () => {
  it('★直前1.2秒以内の足跡だけを古い順に返す', () => {
    const f = createVanishForensics();
    markTrail(f, 'old', 1000);
    markTrail(f, 'render', 9500);
    markTrail(f, 'hide:autoshow_off', 9900);
    expect(recentTrail(f.trail, 10000)).toEqual([
      'render(-500ms)', 'hide:autoshow_off(-100ms)'
    ]);
  });

  it('未来の印は拾わない(時刻が巻き戻っても壊れない)', () => {
    const f = createVanishForensics();
    markTrail(f, 'future', 11000);
    expect(recentTrail(f.trail, 10000)).toEqual([]);
  });

  it('★リングで頭打ちになる(メモリを増やさない)', () => {
    const f = createVanishForensics();
    for (let i = 0; i < TRAIL_MAX + 30; i += 1) markTrail(f, 't' + i, i);
    expect(f.trail.length).toBe(TRAIL_MAX);
  });

  it('壊れた入力でも落ちない', () => {
    expect(() => markTrail(null, 'x', 1)).not.toThrow();
    expect(recentTrail(null, 1)).toEqual([]);
  });
});

describe('noteVanishWithTrail', () => {
  it('★消えた瞬間に直前の足跡を切り出して残す', () => {
    const f = createVanishForensics();
    markTrail(f, 'render', 9800);
    noteVanishWithTrail(f, { nowMs: 10000, w: 0, h: 0, display: 'none' });
    const s = snapshotVanishForensics(f);
    expect(s.vanishCount).toBe(1);
    expect(s.samples[0].before).toEqual(['render(-200ms)']);
    expect(s.samples[0]).toMatchObject({ w: 0, h: 0, display: 'none' });
  });

  it('サンプルは上限で頭打ち(速報を膨らませない)', () => {
    const f = createVanishForensics();
    for (let i = 0; i < 20; i += 1) noteVanishWithTrail(f, { nowMs: i * 100 });
    expect(snapshotVanishForensics(f).samples.length).toBeLessThanOrEqual(4);
    expect(snapshotVanishForensics(f).vanishCount).toBe(20);
  });
});

describe('formatVanishForensicsLine — 0の意味を区別する', () => {
  it('★足跡0件は「未計測」', () => {
    const line = formatVanishForensicsLine({ trailLen: 0, vanishCount: 0, samples: [] });
    expect(line).toContain('未計測');
    expect(line).not.toContain('✅');
  });

  it('足跡ありで消失0なら ✅ かつ件数を併記', () => {
    const line = formatVanishForensicsLine({ trailLen: 40, vanishCount: 0, samples: [] });
    expect(line).toContain('✅');
    expect(line).toContain('足跡40件');
  });

  it('★消えたら直前に走った処理を並べる', () => {
    const line = formatVanishForensicsLine({
      trailLen: 40, vanishCount: 2,
      samples: [{ w: 0, h: 0, display: 'none', before: ['render(-200ms)', 'hide:autoshow_off(-10ms)'] }]
    });
    expect(line).toContain('2回消失');
    expect(line).toContain('直前に走った処理');
    expect(line).toContain('hide:autoshow_off(-10ms)');
  });

  it('★直前に何も走っていなければ外部要因の可能性を明示する', () => {
    const line = formatVanishForensicsLine({
      trailLen: 40, vanishCount: 1, samples: [{ w: 0, h: 0, before: [] }]
    });
    expect(line).toContain('外部要因の可能性');
  });

  it('材料が無ければ空文字', () => {
    expect(formatVanishForensicsLine(null)).toBe('');
  });
});

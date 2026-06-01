import { describe, it, expect } from 'vitest';
import {
  createProgressSamples,
  pushProgressSample,
  evaluateCommentProgress,
  PROGRESS_STATUS
} from './commentProgressMonitor.js';

const MIN = 60_000;

/** t0 起点でサンプル列を作るヘルパ。 */
function build(rows, opts) {
  let s = createProgressSamples();
  for (const r of rows) s = pushProgressSample(s, r, opts);
  return s;
}

describe('pushProgressSample', () => {
  it('サンプルを追加し maxSamples で先頭から丸める（リングバッファ）', () => {
    let s = createProgressSamples();
    for (let i = 0; i < 10; i += 1) {
      s = pushProgressSample(s, { t: i, recorded: i, official: 100 }, { maxSamples: 4 });
    }
    expect(s.length).toBe(4);
    expect(s[0].recorded).toBe(6);
    expect(s[3].recorded).toBe(9);
  });

  it('official が null/不正なら null として格納（負やNaNを潰す）', () => {
    const s = build([
      { t: 0, recorded: 5, official: null },
      { t: 1, recorded: 6, official: NaN },
      { t: 2, recorded: 7, official: -3 }
    ]);
    expect(s[0].official).toBeNull();
    expect(s[1].official).toBeNull();
    expect(s[2].official).toBe(0);
    expect(s[2].recorded).toBe(7);
  });

  it('元配列を破壊しない（イミュータブル）', () => {
    const s0 = createProgressSamples();
    const s1 = pushProgressSample(s0, { t: 0, recorded: 1, official: 10 });
    expect(s0.length).toBe(0);
    expect(s1.length).toBe(1);
  });
});

describe('evaluateCommentProgress', () => {
  it('空サンプルは idle（データ待ち）', () => {
    const r = evaluateCommentProgress(createProgressSamples());
    expect(r.status).toBe(PROGRESS_STATUS.IDLE);
    expect(r.recorded).toBeNull();
    expect(r.pct).toBeNull();
  });

  it('公式件数が不明なら idle（割合判定できない）', () => {
    const s = build([{ t: 0, recorded: 50, official: null }]);
    const r = evaluateCommentProgress(s);
    expect(r.status).toBe(PROGRESS_STATUS.IDLE);
    expect(r.recorded).toBe(50);
    expect(r.official).toBeNull();
  });

  it('目標割合（既定 0.94）到達で reached', () => {
    const s = build([
      { t: 0, recorded: 100, official: 1000 },
      { t: 1 * MIN, recorded: 940, official: 1000 }
    ]);
    const r = evaluateCommentProgress(s);
    expect(r.status).toBe(PROGRESS_STATUS.REACHED);
    expect(r.pct).toBeCloseTo(0.94, 5);
    expect(r.label).toContain('追い切り完了');
  });

  it('ギフト込みで 94% に届かなくても、増えていれば growing', () => {
    const s = build([
      { t: 0, recorded: 100, official: 1000 },
      { t: 1 * MIN, recorded: 300, official: 1000 },
      { t: 2 * MIN, recorded: 500, official: 1000 }
    ]);
    const r = evaluateCommentProgress(s);
    expect(r.status).toBe(PROGRESS_STATUS.GROWING);
    expect(r.label).toContain('取得中');
    expect(r.deltaPerMin).toBeCloseTo(200, 5);
  });

  it('ギャップが残り、stallMs 以上増えていなければ stalled', () => {
    // 0分:200 → 1分:200 → ... → 6分:200（公式1000・gap800・6分増加なし）
    const rows = [];
    for (let m = 0; m <= 6; m += 1) rows.push({ t: m * MIN, recorded: 200, official: 1000 });
    const r = evaluateCommentProgress(build(rows), { stallMs: 5 * MIN });
    expect(r.status).toBe(PROGRESS_STATUS.STALLED);
    expect(r.sinceGrowthMs).toBe(6 * MIN);
    expect(r.label).toContain('停滞');
  });

  it('停滞しきい値未満の無増加は growing のまま（早すぎる停滞判定をしない）', () => {
    const rows = [
      { t: 0, recorded: 200, official: 1000 },
      { t: 2 * MIN, recorded: 200, official: 1000 }
    ];
    const r = evaluateCommentProgress(build(rows), { stallMs: 5 * MIN });
    expect(r.status).toBe(PROGRESS_STATUS.GROWING);
  });

  it('停滞後に再び増えたら sinceGrowth がリセットされ growing に戻る', () => {
    const rows = [
      { t: 0, recorded: 200, official: 1000 },
      { t: 6 * MIN, recorded: 200, official: 1000 },
      { t: 7 * MIN, recorded: 350, official: 1000 }
    ];
    const r = evaluateCommentProgress(build(rows), { stallMs: 5 * MIN });
    expect(r.status).toBe(PROGRESS_STATUS.GROWING);
    expect(r.sinceGrowthMs).toBe(0);
  });

  it('記録数のリセット/減少（500→0）を「停滞」と誤判定しない（再読込・再注入直後の猶予）', () => {
    // Codex 指摘の再現ケース: 500件 → 6分後に 0件（再注入で巻き戻り）。
    //   旧実装は「窓先頭から増えていない」と見て即 stalled だった。
    const rows = [
      { t: 0, recorded: 500, official: 1000 },
      { t: 6 * MIN, recorded: 0, official: 1000 }
    ];
    const r = evaluateCommentProgress(build(rows), { stallMs: 5 * MIN });
    expect(r.status).not.toBe(PROGRESS_STATUS.STALLED);
    expect(r.sinceGrowthMs).toBe(0);
  });

  it('リセット後に横ばいが続けば（500→0→0→0）いずれ stalled（猶予はリセット時点から計測）', () => {
    const rows = [
      { t: 0, recorded: 500, official: 1000 },
      { t: 1 * MIN, recorded: 0, official: 1000 },
      { t: 6 * MIN, recorded: 0, official: 1000 },
      { t: 7 * MIN, recorded: 0, official: 1000 }
    ];
    const r = evaluateCommentProgress(build(rows), { stallMs: 5 * MIN });
    expect(r.status).toBe(PROGRESS_STATUS.STALLED);
    // リセット（1分時点）からの経過で計測されるべき（7-1=6分）。
    expect(r.sinceGrowthMs).toBe(6 * MIN);
  });

  it('reached は stalled より優先（追い切ったら停滞扱いしない）', () => {
    const rows = [];
    for (let m = 0; m <= 8; m += 1) rows.push({ t: m * MIN, recorded: 950, official: 1000 });
    const r = evaluateCommentProgress(build(rows), { stallMs: 5 * MIN });
    expect(r.status).toBe(PROGRESS_STATUS.REACHED);
  });

  it('サンプル1件だけでは stalled にしない（増えていないと言えない）', () => {
    const r = evaluateCommentProgress(
      build([{ t: 10 * MIN, recorded: 100, official: 1000 }]),
      { stallMs: 1 }
    );
    expect(r.status).toBe(PROGRESS_STATUS.GROWING);
  });

  it('小規模放送（公式344）で記録323=93.9%は growing、324=94.2%で reached（49%停滞修正の確認系）', () => {
    const growing = evaluateCommentProgress(
      build([
        { t: 0, recorded: 100, official: 344 },
        { t: 1 * MIN, recorded: 323, official: 344 }
      ])
    );
    expect(growing.status).toBe(PROGRESS_STATUS.GROWING);
    const reached = evaluateCommentProgress(
      build([
        { t: 0, recorded: 100, official: 344 },
        { t: 1 * MIN, recorded: 324, official: 344 }
      ])
    );
    expect(reached.status).toBe(PROGRESS_STATUS.REACHED);
  });
});

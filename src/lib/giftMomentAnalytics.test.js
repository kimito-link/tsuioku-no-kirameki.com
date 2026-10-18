import { describe, expect, it } from 'vitest';
import { analyzeGiftMoments, buildGiftMomentNextActions, GIFT_MOMENT_FORBIDDEN_WORDS } from './giftMomentAnalytics.js';

const T0 = 1_800_000_000_000; // 配信開始の目安(ms)
const MIN = 60_000;
/** ギフト1行: publishedAt は秒 */
const gift = (atMs, over = {}) => ({
  kokenHistoryId: String(over.id ?? atMs),
  userId: '111',
  senderName: '花子',
  itemName: 'シャンパーン',
  points: 100,
  contribution: 1000,
  publishedAt: Math.floor(atMs / 1000),
  ...over
});
/** コメント: 指定の時刻(ms)に件数分 */
const comments = (atMs, n, text = 'こんにちは') => Array.from({ length: n }, (_, i) => ({ capturedAt: atMs + i * 100, userId: `u${i}`, text }));
/** 40分ぶん・毎分 base 件の下地+指定の山 */
function stream(base, bumps = [], minutes = 40) {
  const out = [];
  for (let m = 0; m < minutes; m++) out.push(...comments(T0 + m * MIN, base));
  for (const [m, n] of bumps) out.push(...comments(T0 + m * MIN + 500, n, '盛り上がり盛り上がり'));
  return out;
}
const run = (history, cmts, extra = {}) =>
  analyzeGiftMoments({ history, comments: cmts, concurrentPoints: [], officialTotalPoint: null, officialRemaining: 0, ...extra });

describe('瞬間の作り方', () => {
  it('★前5分・後5分のコメント件数を数える(手計算と一致)', () => {
    // 20分目にギフト。前5分(15〜20分)は毎分2件=10件、後5分(20〜25分)は毎分2件+20分台に山6件
    const cm = stream(2, [[21, 6]]);
    const r = run([gift(T0 + 20 * MIN)], cm);
    expect(r.axisOk).toBe(true);
    expect(r.moments).toHaveLength(1);
    const m = r.moments[0];
    expect(m.fullWindow).toBe(true);
    expect(m.before.comments).toBe(10);
    expect(m.after.comments).toBe(16);
  });
  it('★60秒以内のギフトは1つの瞬間(連鎖)に束ねる。61秒以上は別の瞬間', () => {
    const cm = stream(1);
    const r = run([gift(T0 + 20 * MIN, { id: 'a' }), gift(T0 + 20 * MIN + 50_000, { id: 'b', userId: '222' }), gift(T0 + 20 * MIN + 50_000 + 61_000, { id: 'c' })], cm);
    expect(r.moments).toHaveLength(2);
    expect(r.moments[0].gifts).toHaveLength(2);
    expect(r.moments[0].chain).toBe(true);
    expect(r.moments[1].chain).toBe(false);
    expect(r.moments[0].points).toBe(200);
  });
  it('★窓が足りない瞬間(配信の最初・最後)は fullWindow=false で集計から外す', () => {
    const cm = stream(1);
    const r = run([gift(T0 + 2 * MIN), gift(T0 + 20 * MIN, { id: 'x' })], cm);
    expect(r.moments[0].fullWindow).toBe(false);
    expect(r.summary.n).toBe(1);
  });
  it('★publishedAt が無い行は除外して数える', () => {
    const r = run([gift(T0 + 20 * MIN), { ...gift(T0 + 21 * MIN, { id: 'z' }), publishedAt: 0 }], stream(1));
    expect(r.excluded.noTime).toBe(1);
    expect(r.moments).toHaveLength(1);
  });
});

describe('軸の検疫', () => {
  it('★ギフトの時刻がコメントの記録と重ならない(タイムシフト等)なら、瞬間を出さず理由を出す', () => {
    const r = run([gift(T0 + 5 * 24 * 60 * MIN)], stream(1));
    expect(r.axisOk).toBe(false);
    expect(r.moments).toHaveLength(0);
    expect(r.notes.join('')).toContain('重なりません');
  });
  it('★一部のギフトだけ記録の前(途中から開いた配信)なら、そのギフトだけ外して残りは比較する', () => {
    const r = run([gift(T0 - 3 * 60 * MIN, { id: 'old' }), gift(T0 + 20 * MIN, { id: 'ok' })], stream(1));
    expect(r.axisOk).toBe(true);
    expect(r.moments).toHaveLength(1);
    expect(r.excluded.outOfRange).toBe(1);
    expect(r.notes.join('')).toContain('1件は、前後の比較から外しています');
  });
  it('★コメントが1件も無いときは前後比較を出さない', () => {
    const r = run([gift(T0 + 20 * MIN)], []);
    expect(r.axisOk).toBe(false);
    expect(r.moments).toHaveLength(0);
  });
});

describe('集計と表示条件', () => {
  /** n 件のギフト(60分以上あけず 3分間隔だと連鎖しない) */
  const many = (n, startMin = 10, stepMin = 2) => Array.from({ length: n }, (_, i) => gift(T0 + (startMin + i * stepMin) * MIN, { id: `g${i}`, userId: `${100 + i}` }));
  it('★n<5 のとき、中央値・割合を出さない(null)', () => {
    const r = run(many(4), stream(1));
    expect(r.summary.n).toBe(4);
    expect(r.summary.medianDelta).toBeNull();
    expect(r.summary.k).toBeNull();
    expect(r.notes.join('')).toContain('5件未満');
  });
  it('★n≥5 のとき、k/n と後−前の中央値を出す', () => {
    // どのギフトの後も +山あり
    // ギフト同士を11分以上あける(前の山が次の「前5分」に入らないように)
    const bumps = [];
    const g = many(6, 8, 11);
    for (const x of g) bumps.push([Math.floor((x.publishedAt * 1000 - T0) / MIN) + 1, 5]);
    const r = run(g, stream(1, bumps, 90));
    expect(r.summary.n).toBe(6);
    expect(r.summary.k).toBe(6);
    expect(r.summary.medianDelta).toBeGreaterThan(0);
  });
  it('★履歴が 100件を超えている(残りあり)とき、古い分を含まないと明記する', () => {
    const r = run([gift(T0 + 20 * MIN)], stream(1), { officialRemaining: 30, officialTotalPoint: 99999 });
    expect(r.notes.join('')).toContain('残り 30件');
  });
  it('★公式の合計と明細の合計が一致しないとき、一致と言わず両方併記する', () => {
    const r = run([gift(T0 + 20 * MIN, { points: 100 })], stream(1), { officialTotalPoint: 500, officialRemaining: 0 });
    const t = r.notes.join('');
    expect(t).toContain('一致しません');
    expect(t).toContain('500');
  });
  it('★公式の合計と一致するときはそう言う', () => {
    const r = run([gift(T0 + 20 * MIN, { points: 100 })], stream(1), { officialTotalPoint: 100, officialRemaining: 0 });
    expect(r.notes.join('')).toContain('公式の合計 100pt と一致');
  });
  it('★相関の注記は必ず入る', () => {
    const r = run([gift(T0 + 20 * MIN)], stream(1));
    expect(r.notes.join('')).toContain('ギフトが原因とは限りません');
  });
  it('履歴が空なら瞬間も注記も作らない(章ごと省略できる)', () => {
    const r = run([], stream(1));
    expect(r.moments).toHaveLength(0);
    expect(r.hasHistory).toBe(false);
  });
});

describe('同接と話題語', () => {
  it('★同接は窓の端に最も近い点(±90秒以内)で前後差を出す。無ければ null', () => {
    const cp = [{ at: T0 + 15 * MIN, value: 100, kind: 'official' }, { at: T0 + 25 * MIN, value: 130, kind: 'official' }];
    const r = run([gift(T0 + 20 * MIN)], stream(1), { concurrentPoints: cp });
    expect(r.moments[0].viewers).toEqual({ before: 100, after: 130, diff: 30, kind: 'official' });
    const r2 = run([gift(T0 + 20 * MIN)], stream(1), { concurrentPoints: [{ at: T0, value: 5, kind: 'official' }] });
    expect(r2.moments[0].viewers).toBeNull();
  });
  it('★話題語は窓内のコメントから上位3語(2回以上出たものだけ)', () => {
    const cm = [...stream(1), ...comments(T0 + 18 * MIN, 5, 'ガチャ最高')];
    const r = run([gift(T0 + 20 * MIN)], cm);
    expect(r.moments[0].topics.length).toBeLessThanOrEqual(3);
    expect(r.moments[0].topics.join('')).toContain('ガチャ');
  });
});

describe('次回の一言(断定しない)', () => {
  it('★n<5 は「見比べると」の1行だけ', () => {
    const lines = buildGiftMomentNextActions({ n: 3, k: null, medianDelta: null, chainCount: 0, quietCount: 0 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('見比べる');
  });
  it('★n≥5 で k/n≥0.6 のとき、増えやすい回という一言(かもしれません)', () => {
    const lines = buildGiftMomentNextActions({ n: 10, k: 7, medianDelta: 4, chainCount: 0, quietCount: 0 });
    expect(lines.join('')).toContain('かもしれません');
  });
  it('★どの文にも断定語を含めない', () => {
    const all = [
      ...buildGiftMomentNextActions({ n: 10, k: 8, medianDelta: 5, chainCount: 3, quietCount: 6 }),
      ...buildGiftMomentNextActions({ n: 2, k: null, medianDelta: null, chainCount: 0, quietCount: 0 })
    ].join('');
    for (const w of GIFT_MOMENT_FORBIDDEN_WORDS) expect(all).not.toContain(w);
  });
  it('最大3行', () => {
    expect(buildGiftMomentNextActions({ n: 10, k: 8, medianDelta: 5, chainCount: 3, quietCount: 6 }).length).toBeLessThanOrEqual(3);
  });
});

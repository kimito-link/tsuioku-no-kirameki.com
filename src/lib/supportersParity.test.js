import { describe, expect, it } from 'vitest';
import { judgeSupportersParity, formatSupportersParityLine } from './supportersParity.js';

const NOW = 1_000_000;
const mirror = (rooms, extra = {}) => ({ liveId: 'lv1', capturedAt: NOW - 5_000, rooms, ...extra });
const rows = (arr) => arr.map(([userKey, count]) => ({ userKey, count }));

describe('judgeSupportersParity: popup の応援ランキング(鏡)とレポート集計の上位の値を突き合わせる', () => {
  const popup = mirror(rows([['a:x', 150], ['u2', 140], ['u3', 130], ['u4', 100]]));

  it('上位3の顔ぶれ・順位・件数が一致 → match', () => {
    const r = judgeSupportersParity(popup, { liveId: 'lv1', topSupporters: rows([['a:x', 150], ['u2', 140], ['u3', 130]]) }, 'lv1', NOW);
    expect(r.state).toBe('match');
  });

  it('件数の差が許容幅(絶対3 or 5%)以内 → explained(レポートは15秒に1回の更新=遅れの差)', () => {
    const r = judgeSupportersParity(popup, { liveId: 'lv1', topSupporters: rows([['a:x', 147], ['u2', 139], ['u3', 128]]) }, 'lv1', NOW);
    expect(r.state).toBe('explained');
    expect(r.reason).toContain('差');
  });

  it('許容幅を超える件数の差 → mismatch(popup の件数が2500サンプルで縮んでいた型を検出する)', () => {
    const r = judgeSupportersParity(popup, { liveId: 'lv1', topSupporters: rows([['a:x', 380], ['u2', 350], ['u3', 330]]) }, 'lv1', NOW);
    expect(r.state).toBe('mismatch');
    expect(r.code).toBe('supporters_count_mismatch');
    expect(r.reason).toContain('a:x');
  });

  it('上位3の顔ぶれが違う(別人が入っている) → mismatch', () => {
    const r = judgeSupportersParity(popup, { liveId: 'lv1', topSupporters: rows([['a:x', 150], ['zz', 141], ['u3', 130]]) }, 'lv1', NOW);
    expect(r.state).toBe('mismatch');
    expect(r.code).toBe('supporters_members_mismatch');
  });

  it('同数の人どうしの入れ替わり(同じ件数で順位だけ違う)は mismatch にしない(explained)', () => {
    const p = mirror(rows([['a', 100], ['b', 100], ['c', 90]]));
    const r = judgeSupportersParity(p, { liveId: 'lv1', topSupporters: rows([['b', 100], ['a', 100], ['c', 90]]) }, 'lv1', NOW);
    expect(r.state).not.toBe('mismatch');
  });

  it('取れていない・古い・別配信は必ず pending(mismatch にしない=嘘の🔴を出さない)', () => {
    const ok = { liveId: 'lv1', topSupporters: rows([['a:x', 150]]) };
    expect(judgeSupportersParity(null, ok, 'lv1', NOW).state).toBe('pending');
    expect(judgeSupportersParity(popup, null, 'lv1', NOW).state).toBe('pending');
    expect(judgeSupportersParity(mirror(rows([]), {}), ok, 'lv1', NOW).state).toBe('pending');
    expect(judgeSupportersParity(mirror(rows([['a:x', 150]]), { liveId: 'lv9' }), ok, 'lv1', NOW).state).toBe('pending');
    expect(judgeSupportersParity(popup, { liveId: 'lv9', topSupporters: rows([['a:x', 150]]) }, 'lv1', NOW).state).toBe('pending');
    expect(judgeSupportersParity(mirror(rows([['a:x', 150]]), { capturedAt: NOW - 900_000 }), ok, 'lv1', NOW).state).toBe('pending');
  });

  it('レポート側が2人しか無い等で比べる人数が足りないときは、比べられる人数だけで判定する', () => {
    const r = judgeSupportersParity(popup, { liveId: 'lv1', topSupporters: rows([['a:x', 150], ['u2', 140]]) }, 'lv1', NOW);
    expect(r.state).toBe('match');
    expect(r.compared).toBe(2);
  });

  it('レポート側が空(0人)なら pending', () => {
    expect(judgeSupportersParity(popup, { liveId: 'lv1', topSupporters: [] }, 'lv1', NOW).state).toBe('pending');
  });
});

describe('formatSupportersParityLine: 状態速報の1行(数字だけ・原因を断定しない)', () => {
  it('state ごとに印と理由を出す', () => {
    expect(formatSupportersParityLine({ state: 'match', reason: 'x', code: 'c', compared: 3 })).toContain('✅');
    expect(formatSupportersParityLine({ state: 'explained', reason: 'x', code: 'c', compared: 3 })).toContain('✅');
    expect(formatSupportersParityLine({ state: 'mismatch', reason: 'x', code: 'c', compared: 3 })).toContain('🔴');
    expect(formatSupportersParityLine({ state: 'pending', reason: 'x', code: 'c', compared: 0 })).toContain('🟡');
    expect(formatSupportersParityLine(null)).toBe('');
  });
});

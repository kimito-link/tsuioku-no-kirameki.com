import { describe, expect, it } from 'vitest';
import { mergeDisplay, nextPassDelayMs, orderNewFirst, seedDisplayFromLives, shouldStartPass } from './liveTallyLoop.js';

describe('orderNewFirst', () => {
  it('前回の作業状態が無い配信(新しく一覧に入った配信)を先に、残りは一覧の順', () => {
    const lives = [{ liveId: 'lv100000001' }, { liveId: 'LV100000002' }, { liveId: 'lv100000003' }];
    const out = orderNewFirst(lives, { lv100000001: { maxNo: 1 }, lv100000003: { maxNo: 2 } });
    expect(out.map((l) => l.liveId)).toEqual(['LV100000002', 'lv100000001', 'lv100000003']);
    expect(lives[0].liveId).toBe('lv100000001');
  });
  it('state が無ければ並びはそのまま', () => {
    const lives = [{ liveId: 'lv100000001' }, { liveId: 'lv100000002' }];
    expect(orderNewFirst(lives, null)).toEqual(lives);
  });
});

describe('seedDisplayFromLives / mergeDisplay', () => {
  const c = (n) => ({ rankers: [], comments: n });
  it('lives[].comment を lv 小文字キーで拾う(形の違うものは拾わない)', () => {
    const out = seedDisplayFromLives([{ liveId: 'LV100000001', comment: c(3) }, { liveId: 'lv100000002', comment: null }, { liveId: 'lv100000003', comment: { x: 1 } }]);
    expect(Object.keys(out)).toEqual(['lv100000001']);
  });
  it('今回の値を優先し、数えられなかった配信は前の値を持ち越す。一覧に居ない配信は落とす', () => {
    const lives = [{ liveId: 'lv100000001' }, { liveId: 'lv100000002' }, { liveId: 'lv100000004' }];
    const out = mergeDisplay({ lv100000001: c(1), lv100000002: c(2), lv100000003: c(3) }, { LV100000001: c(10) }, lives);
    expect(out).toEqual({ lv100000001: c(10), lv100000002: c(2) });
  });
});

describe('shouldStartPass / nextPassDelayMs', () => {
  const base = { startedAtMs: 0, loopMs: 390_000, hardDeadlineMs: 540_000, passBudgetMs: 45_000 };
  it('くり返しの上限より前なら始める・過ぎたら始めない・1 回きりモードは始めない', () => {
    expect(shouldStartPass({ ...base, nowMs: 300_000 })).toBe(true);
    expect(shouldStartPass({ ...base, nowMs: 390_000 })).toBe(false);
    expect(shouldStartPass({ ...base, loopMs: 0, nowMs: 1 })).toBe(false);
  });
  it('固い締め切りまで 1 回ぶんの余裕が無ければ始めない', () => {
    expect(shouldStartPass({ ...base, loopMs: 600_000, nowMs: 500_000 })).toBe(false);
  });
  it('回の開始どうしを 60 秒空ける・長引いた回の後でも最低 5 秒', () => {
    expect(nextPassDelayMs({ nowMs: 20_000, passStartedAtMs: 0, intervalMs: 60_000 })).toBe(40_000);
    expect(nextPassDelayMs({ nowMs: 150_000, passStartedAtMs: 0, intervalMs: 60_000 })).toBe(5_000);
  });
});

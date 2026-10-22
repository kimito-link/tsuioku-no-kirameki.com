import { describe, expect, it } from 'vitest';
import { LIVE_EVENT_MAX_BYTES, planLiveEventBatch, shouldFlushLiveEvents } from './liveEventBatch.js';

const c = (n, text = 'x') => ({ type: 'comment', no: n, text });
const g = (n) => ({ type: 'gift', no: n, name: 'ギフト' });

describe('shouldFlushLiveEvents(3秒ごと・変化があるときだけ)', () => {
  it('ためているものが無ければ送らない', () => {
    expect(shouldFlushLiveEvents({ pendingCount: 0, lastFlushAt: 0, nowMs: 99_999 })).toBe(false);
  });
  it('前回から3秒たっていれば送る・たっていなければ待つ', () => {
    expect(shouldFlushLiveEvents({ pendingCount: 1, lastFlushAt: 1000, nowMs: 3999 })).toBe(false);
    expect(shouldFlushLiveEvents({ pendingCount: 1, lastFlushAt: 1000, nowMs: 4000 })).toBe(true);
  });
});

describe('planLiveEventBatch(5KiB・50件・ギフトは落とさない)', () => {
  it('収まるなら全部を元の順で送る', () => {
    const r = planLiveEventBatch({ pending: [c(1), g(2), c(3)] });
    expect(r).toEqual({ send: [c(1), g(2), c(3)], carry: [], dropped: 0 });
  });
  it('★件数を超えたら古いコメントから落とし、件数を正直に数える', () => {
    const pending = Array.from({ length: 60 }, (_, i) => c(i + 1));
    const r = planLiveEventBatch({ pending });
    expect(r.send).toHaveLength(50);
    expect(r.send[0].no).toBe(11);
    expect(r.send.at(-1).no).toBe(60);
    expect(r.dropped).toBe(10);
  });
  it('★ギフトはコメントより先に席を取り、コメントだけが落ちる', () => {
    const pending = [g(1), ...Array.from({ length: 55 }, (_, i) => c(i + 2)), g(57)];
    const r = planLiveEventBatch({ pending });
    expect(r.send.filter((e) => e.type === 'gift').map((e) => e.no)).toEqual([1, 57]);
    expect(r.send).toHaveLength(50);
    expect(r.dropped).toBe(7);
    expect(r.carry).toEqual([]);
  });
  it('★ギフトだけで上限を超えたら、入りきらない分は落とさず次の回へ回す', () => {
    const gifts = Array.from({ length: 52 }, (_, i) => g(i + 1));
    const r = planLiveEventBatch({ pending: gifts });
    expect(r.send).toHaveLength(50);
    expect(r.carry.map((e) => e.no)).toEqual([51, 52]);
    expect(r.dropped).toBe(0);
  });
  it('★大きさは UTF-8 のバイトで 5KiB 以下に収める(日本語の長いコメント)', () => {
    const long = 'あ'.repeat(300); // 約900バイト
    const pending = Array.from({ length: 10 }, (_, i) => c(i + 1, long));
    const r = planLiveEventBatch({ pending });
    const bytes = new TextEncoder().encode(JSON.stringify(r.send)).length;
    expect(bytes).toBeLessThanOrEqual(LIVE_EVENT_MAX_BYTES);
    expect(r.send.at(-1).no).toBe(10);
    expect(r.send.length + r.dropped).toBe(10);
    expect(r.dropped).toBeGreaterThan(0);
  });
  it('壊れた入力でも落ちない', () => {
    expect(planLiveEventBatch({ pending: [null, 1, c(1)] })).toEqual({ send: [c(1)], carry: [], dropped: 0 });
    expect(planLiveEventBatch(/** @type {any} */ (undefined))).toEqual({ send: [], carry: [], dropped: 0 });
  });
});

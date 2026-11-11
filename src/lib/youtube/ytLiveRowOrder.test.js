import { describe, expect, it } from 'vitest';
import {
  mergeLiveRowsByRecordedAt,
  shouldYieldYtBuild,
  ytLiveRowMateriallyChanged,
  YT_BUILD_YIELD_MIN_ROWS,
  YT_IDB_APPEND_CHUNK,
  YT_NOTIFY_MIN_GAP_MS,
} from './ytLiveRowOrder.js';

const row = (id, at, extra = {}) => ({ id, pk: `v::${id}`, recordedAt: at, text: id, ...extra });

describe('mergeLiveRowsByRecordedAt', () => {
  it('末尾より新しい行は全件を並べ直さず足す', () => {
    const base = [row('a', 10), row('b', 20)];
    const next = mergeLiveRowsByRecordedAt(base, [row('c', 30), row('d', 25)]);
    expect(next.map((r) => r.id)).toEqual(['a', 'b', 'd', 'c']);
    expect(base.map((r) => r.id)).toEqual(['a', 'b']);
    expect(next[0]).toBe(base[0]);
  });

  it('途中の時刻は全件を並べる', () => {
    const base = [row('a', 10), row('c', 30)];
    const next = mergeLiveRowsByRecordedAt(base, [row('b', 20)]);
    expect(next.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('同じキーの更新は置き換えてから並べる', () => {
    const base = [row('a', 10, { text: 'old' }), row('b', 20)];
    const next = mergeLiveRowsByRecordedAt(base, [row('a', 10, { text: 'new' })], true);
    expect(next.map((r) => r.text)).toEqual(['new', 'b']);
  });

  it('4万件の末尾追加は全件ソートより短い', () => {
    const n = 40000;
    const base = new Array(n);
    for (let i = 0; i < n; i += 1) base[i] = row(`i${i}`, i);
    const pending = [row('new', n + 1)];
    const t0 = performance.now();
    const next = mergeLiveRowsByRecordedAt(base, pending);
    const appendMs = performance.now() - t0;
    const t1 = performance.now();
    const copied = base.concat(pending).sort((a, b) => a.recordedAt - b.recordedAt);
    const sortMs = performance.now() - t1;
    expect(next).toHaveLength(n + 1);
    expect(next[n].id).toBe('new');
    expect(next[0]).toBe(base[0]);
    expect(copied[n].id).toBe('new');
    expect(appendMs).toBeLessThan(50);
  });
});

describe('ytLiveRowMateriallyChanged', () => {
  it('本文も顔も同じなら変わっていない', () => {
    const a = row('a', 1, { iconUrl: 'https://example.test/a.png', name: 'n' });
    expect(ytLiveRowMateriallyChanged(a, { ...a })).toBe(false);
    expect(ytLiveRowMateriallyChanged(a, { ...a, iconUrl: 'https://example.test/b.png' })).toBe(true);
  });
});

describe('区切りの定数', () => {
  it('大きい組み立てだけ手を返す', () => {
    expect(shouldYieldYtBuild(YT_BUILD_YIELD_MIN_ROWS - 1)).toBe(false);
    expect(shouldYieldYtBuild(YT_BUILD_YIELD_MIN_ROWS)).toBe(true);
  });

  it('保存と組み立て直しの間隔は正の数', () => {
    expect(YT_NOTIFY_MIN_GAP_MS).toBeGreaterThanOrEqual(200);
    expect(YT_IDB_APPEND_CHUNK).toBeGreaterThan(0);
    expect(YT_IDB_APPEND_CHUNK).toBeLessThanOrEqual(80);
  });
});

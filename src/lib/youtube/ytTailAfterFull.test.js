import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ytTailAfterFull } from './ytTailAfterFull.js';

const rows = (from, to) => Array.from({ length: to - from }, (_, i) => ({ id: `m${from + i}` }));

describe('ytTailAfterFull: 全件を渡したあとのテールを短くする', () => {
  it('全件をまだ渡していない・max 件以下なら、そのまま全部', () => {
    const arr = rows(0, 50);
    expect(ytTailAfterFull(arr, undefined, 10)).toEqual({ rows: arr, short: false });
    expect(ytTailAfterFull(arr, arr, 100)).toEqual({ rows: arr, short: false });
  });
  it('何も増えていなければ最新 max 件', () => {
    const arr = rows(0, 50);
    const r = ytTailAfterFull(arr, arr, 10);
    expect(r.short).toBe(true);
    expect(r.rows.map((e) => e.id)).toEqual(rows(40, 50).map((e) => e.id));
  });
  it('末尾に増えた分は最新 max 件に入る', () => {
    const full = rows(0, 50);
    const now = rows(0, 55); // 別の配列(作り直し)
    const r = ytTailAfterFull(now, full, 10);
    expect(r.short).toBe(true);
    expect(r.rows.map((e) => e.id)).toEqual(rows(45, 55).map((e) => e.id));
  });
  it('途中に入った新しい行(並べ替えで末尾に来ない行)も落とさない', () => {
    const full = rows(0, 50);
    const now = [...rows(0, 20), { id: 'late1' }, ...rows(20, 50), { id: 'm50' }];
    const r = ytTailAfterFull(now, full, 10);
    expect(r.short).toBe(true);
    const ids = r.rows.map((e) => e.id);
    expect(ids[0]).toBe('late1');
    expect(ids).toContain('m50');
    expect(ids.length).toBe(11);
    // 順番は元の並びのまま
    expect(ids.slice(1)).toEqual(now.slice(now.length - 10).map((e) => e.id));
  });
  it('増えた行が max 件を超えるときは全部渡す(取りこぼさない)', () => {
    const full = rows(0, 50);
    const now = [...rows(100, 125), ...rows(0, 50)];
    expect(ytTailAfterFull(now, full, 10)).toEqual({ rows: now, short: false });
  });
  it('全件として渡した行が1つも落ちない: 渡した全件 + テール = いまの全件', () => {
    const full = rows(0, 3000);
    const now = [...rows(0, 1500), { id: 'x1' }, ...rows(1500, 3000), ...rows(3000, 3200)];
    const r = ytTailAfterFull(now, full, 2000);
    const seen = new Set([...full, ...r.rows].map((e) => e.id));
    for (const e of now) expect(seen.has(e.id)).toBe(true);
  });
});

describe('shim の配線', () => {
  const shim = readFileSync(new URL('../../../extension-youtube/src/ytNicoShim.js', import.meta.url), 'utf8');
  it('横の欄のテールは ytTailAfterFull を通す(会場は今までどおり)', () => {
    expect(shim).toContain("import { ytTailAfterFull } from '../../src/lib/youtube/ytTailAfterFull.js';");
    expect(shim).toContain('if (IS_VENUE_CONTEXT) return tailForContext(arr);');
    expect(shim).toContain('const t = ytTailAfterFull(arr, lastFullAnswered.get(lv), TAIL_MAX_ROWS);');
  });
});

describe('shim: 組み立てで、材料が同じ行は前に作った行を使う(v0.1.1983)', () => {
  const shim = readFileSync(new URL('../../../extension-youtube/src/ytNicoShim.js', import.meta.url), 'utf8');
  it('材料(配信・人のキー・顔・開始時刻・番号・並びの位置)が全部同じときだけ使い回す', () => {
    expect(shim).toContain('if (prev && prev.lv === lv && prev.key === key && prev.icon === icon && prev.st === streamStartedAt && prev.no === no && prev.i === i) {');
    expect(shim).toContain('const builtEntryMemo = new WeakMap();');
  });
  it('使い回した行でも、顔の控えと大事なコメントの印は毎回付ける', () => {
    const at = shim.indexOf('rowsMade += 1;');
    const tail = shim.slice(at, at + 400);
    expect(tail).toContain('if (icon && e.userId) ytIconByNumericUid.set(e.userId, icon);');
    expect(tail).toContain('if (important?.[i]) ytVoiceImportantKeys.set(');
  });
});

import { describe, it, expect } from 'vitest';
import { pickCommentsForExport } from './pickCommentsForExport.js';

describe('pickCommentsForExport (v0.1.853 レポート全件反映の根治)', () => {
  it('storage 全件があればそれを最優先(表示キャップ済みエントリで上書きしない)', () => {
    const full = Array.from({ length: 7855 }, (_, i) => ({ id: i }));
    const mem = Array.from({ length: 27 }, (_, i) => ({ id: i })); // 表示用キャップ済み。
    // popup を当該配信で開いていても(memMatchesLive=true)、全件を返す=27件で潰さない。
    expect(pickCommentsForExport(full, mem, true)).toBe(full);
    expect(pickCommentsForExport(full, mem, true).length).toBe(7855);
  });

  it('storage が空のときだけ、同一配信の表示エントリにフォールバック(空レポートよりマシ)', () => {
    const mem = [{ id: 1 }, { id: 2 }];
    expect(pickCommentsForExport([], mem, true)).toBe(mem);
  });

  it('storage 空 & 別配信の表示エントリは使わない(誤って別配信を混ぜない)', () => {
    const mem = [{ id: 1 }];
    expect(pickCommentsForExport([], mem, false)).toEqual([]);
  });

  it('両方空/不正でも落ちず空配列', () => {
    expect(pickCommentsForExport(null, null, true)).toEqual([]);
    expect(pickCommentsForExport(undefined, [], false)).toEqual([]);
  });
});

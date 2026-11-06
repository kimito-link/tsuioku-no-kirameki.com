import { describe, it, expect } from 'vitest';
import { pickYtCrossVideoDuplicates } from './ytCrossVideoDuplicates.js';

const r = (videoId, id, recordedAt, extra = {}) => ({ pk: `${videoId}::${id}`, id, videoId, recordedAt, ...extra });

describe('pickYtCrossVideoDuplicates', () => {
  it('同じコメントが2つの配信にあれば、先に記録した配信の1件だけ残す(Kai Cenat→高松あい)', () => {
    const rows = [
      r('rykn3opnCyQ', 'c1', 100),
      r('rykn3opnCyQ', 'c2', 110),
      r('2Vo9vKQlvyQ', 'c1', 500),
      r('2Vo9vKQlvyQ', 'c2', 500.001),
      r('2Vo9vKQlvyQ', 'j1', 600),
    ];
    const out = pickYtCrossVideoDuplicates(rows);
    expect(out.deletePks.sort()).toEqual(['2Vo9vKQlvyQ::c1', '2Vo9vKQlvyQ::c2']);
    expect(out.byVideo).toEqual({ '2Vo9vKQlvyQ': 2 });
    expect(out.pairs).toEqual({ 'rykn3opnCyQ>2Vo9vKQlvyQ': 2 });
  });

  it('3つの配信に広がっていても、残すのは最初の1件だけ', () => {
    const out = pickYtCrossVideoDuplicates([r('B', 'x', 300), r('A', 'x', 100), r('C', 'x', 200)]);
    expect(out.deletePks.sort()).toEqual(['B::x', 'C::x']);
  });

  it('同じ時刻なら、アーカイブで書かれた時刻を持つ方を残す・それも同じなら配信IDの順(毎回同じ答え)', () => {
    expect(pickYtCrossVideoDuplicates([r('A', 'x', 100), r('B', 'x', 100, { postedAtMs: 100 })]).deletePks).toEqual(['A::x']);
    const a = pickYtCrossVideoDuplicates([r('B', 'y', 100), r('A', 'y', 100)]).deletePks;
    const b = pickYtCrossVideoDuplicates([r('A', 'y', 100), r('B', 'y', 100)]).deletePks;
    expect(a).toEqual(['B::y']);
    expect(b).toEqual(a);
  });

  it('1つの配信にしか無いコメント・id の無い行には触らない', () => {
    const out = pickYtCrossVideoDuplicates([r('A', 'x', 1), r('B', 'y', 2), { pk: 'B::', id: '', videoId: 'B' }, null]);
    expect(out.deletePks).toEqual([]);
  });

  it('2回やっても結果は変わらない(消したあとに残った記録には、もう消すものが無い)', () => {
    const rows = [r('A', 'x', 1), r('B', 'x', 2), r('B', 'z', 3)];
    const first = pickYtCrossVideoDuplicates(rows);
    const rest = rows.filter((x) => !first.deletePks.includes(x.pk));
    expect(pickYtCrossVideoDuplicates(rest).deletePks).toEqual([]);
  });
});

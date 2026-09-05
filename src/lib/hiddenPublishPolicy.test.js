import { describe, it, expect } from 'vitest';
import { decideHiddenWork } from './hiddenPublishPolicy.js';

describe('hiddenPublishPolicy', () => {
  it('見えているときは両方やる', () => {
    expect(decideHiddenWork({ docHidden: false, venueOpen: false }))
      .toEqual({ paint: true, publish: true, reason: 'visible' });
  });

  it('★隠れていても会場が開いていれば鏡は書く(会場にギフトが出ない件の根治)', () => {
    const d = decideHiddenWork({ docHidden: true, venueOpen: true });
    expect(d.publish).toBe(true);   // ← 鏡は更新される
    expect(d.paint).toBe(false);    // ← 描画は止めたまま(重くしない)
    expect(d.reason).toBe('hidden-but-venue-open');
  });

  it('隠れていて会場も閉じていれば両方止める(誰も読まない=省電力)', () => {
    const d = decideHiddenWork({ docHidden: true, venueOpen: false });
    expect(d.paint).toBe(false);
    expect(d.publish).toBe(false);
  });

  it('入力が空でも落ちない', () => {
    expect(() => decideHiddenWork(null)).not.toThrow();
    expect(decideHiddenWork(null).publish).toBe(true); // hidden 不明=見えている扱い
  });
});

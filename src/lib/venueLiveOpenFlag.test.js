import { describe, it, expect } from 'vitest';
import {
  KEY_VENUE_LIVE_OPEN,
  buildVenueLiveOpenValue,
  isVenueLiveOpen
} from './venueLiveOpenFlag.js';

/**
 * ★v0.1.1425: 「会場モードが忠実にでてない」(実機 2026-08-17)の本体。
 *   実機の会場は3人なのに、状態速報は `鏡stale(656s) … tanu332` と
 *   11分前・別配信の332人を出し続けていた。
 *   v0.1.1394 の根治は正しかったが、読む側だけあって【書く側が居なかった】。
 */
describe('venueLiveOpenFlag', () => {
  it('★復元用キーとは別物であること(混ぜると「復元しない」要望を壊す)', () => {
    expect(KEY_VENUE_LIVE_OPEN).not.toBe('nls_venue_open');
  });

  it('開いた印/閉じた印を作れる', () => {
    expect(buildVenueLiveOpenValue(true, 1000)).toEqual({ open: true, at: 1000 });
    expect(buildVenueLiveOpenValue(false, 1000)).toEqual({ open: false, at: 1000 });
  });

  it('★開いている印は信じる', () => {
    const v = buildVenueLiveOpenValue(true, 10_000);
    expect(isVenueLiveOpen(v, 10_000)).toBe(true);
    expect(isVenueLiveOpen(v, 40_000)).toBe(true); // 30秒後もまだ有効
  });

  it('★閉じた印は信じない', () => {
    expect(isVenueLiveOpen(buildVenueLiveOpenValue(false, 10_000), 10_000)).toBe(false);
  });

  it('★古すぎる印は信じない(会場がクラッシュして false を書けずに終わった残骸)', () => {
    const v = buildVenueLiveOpenValue(true, 0);
    expect(isVenueLiveOpen(v, 89_000)).toBe(true);
    expect(isVenueLiveOpen(v, 91_000)).toBe(false);
    // 実機で観測された 656 秒前の残骸は当然落ちる。
    expect(isVenueLiveOpen(v, 656_000)).toBe(false);
  });

  it('未来時刻(時計ズレ)は通す=安全側', () => {
    expect(isVenueLiveOpen(buildVenueLiveOpenValue(true, 50_000), 10_000)).toBe(true);
  });

  it('★壊れた値・欠損は false(確認できたときだけ書く=v0.1.1397 の方針を守る)', () => {
    expect(isVenueLiveOpen(null, 1000)).toBe(false);
    expect(isVenueLiveOpen(undefined, 1000)).toBe(false);
    expect(isVenueLiveOpen({}, 1000)).toBe(false);
    expect(isVenueLiveOpen({ open: 'yes' }, 1000)).toBe(false); // 文字列は信じない
    expect(isVenueLiveOpen({ open: true }, 1000)).toBe(false);  // at 欠損は信じない
    expect(isVenueLiveOpen(true, 1000)).toBe(false);            // 素の真偽値は形が違う
  });
});

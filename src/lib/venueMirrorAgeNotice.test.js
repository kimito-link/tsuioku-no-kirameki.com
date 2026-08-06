import { describe, expect, it } from 'vitest';
import { venueMirrorAgeNotice } from './venueLaneMirrorSupply.js';
import { VENUE_LANE_MIRROR_SOFT_WINDOW_MS } from './venueLaneParity.js';

/**
 * ★v0.1.1280: 会場が「①の鏡がどれくらい古いか」を隠さず出すための文言。
 *
 *   会場と①がずれる最大の原因は鏡の陳腐化(実測 656秒)。SOFT〜HARD の帯域は
 *   ちらつき防止のため【意図的に古い鏡を使い続ける】設計なので、降格させずに
 *   事実だけをユーザーに見せる。これが「知らないことを断定しない」の実装。
 */
describe('venueMirrorAgeNotice — 鏡の鮮度をユーザーに正直に伝える', () => {
  it('fallback は「①パネル未接続」(鏡を使っていないと明言する)', () => {
    expect(venueMirrorAgeNotice('fallback', 0)).toBe('①パネル未接続');
    // 年齢に関係なく fallback は fallback。
    expect(venueMirrorAgeNotice('fallback', 99999)).toBe('①パネル未接続');
    expect(venueMirrorAgeNotice('fallback', -1)).toBe('①パネル未接続');
  });

  it('新鮮(SOFT以内)なら何も出さない=通常時に画面を汚さない', () => {
    expect(venueMirrorAgeNotice('mirror', 0)).toBe('');
    expect(venueMirrorAgeNotice('mirror', 179)).toBe('');
    expect(venueMirrorAgeNotice('mirror', 180)).toBe(''); // 境界(SOFT ちょうど)は新鮮側
  });

  it('★SOFTを超えたら分単位で古さを出す(使い続けているが古い、と伝える)', () => {
    expect(venueMirrorAgeNotice('mirror', 181)).toBe('①の鏡 3分前（①パネルを開くと更新）');
    // ★実測値: ユーザー実機で観測された 656秒 = 11分。
    expect(venueMirrorAgeNotice('mirror', 656)).toBe('①の鏡 11分前（①パネルを開くと更新）');
  });

  it('年齢が不明(負値/非有限)なら何も出さない=嘘をつかない', () => {
    expect(venueMirrorAgeNotice('mirror', -1)).toBe('');
    expect(venueMirrorAgeNotice('mirror', NaN)).toBe('');
    expect(venueMirrorAgeNotice('mirror', Infinity)).toBe('');
  });

  it('★既定のSOFT窓が venueLaneParity の定数と一致している(二重管理の乖離を防ぐ)', () => {
    const softSec = VENUE_LANE_MIRROR_SOFT_WINDOW_MS / 1000;
    // 既定引数(180)がSOFT窓と同じであることを、定数側を正として断言する。
    expect(venueMirrorAgeNotice('mirror', softSec)).toBe('');
    expect(venueMirrorAgeNotice('mirror', softSec + 1)).not.toBe('');
  });
});

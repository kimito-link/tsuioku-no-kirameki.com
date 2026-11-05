import { describe, it, expect } from 'vitest';
import { ytIconColorStats, ytLooksLikeDefaultLetterIcon, ytLooksLikeDefaultIcon, ytIconCacheKey, makeYtDefaultIconJudge } from '../../../extension-youtube/src/ytDefaultIcon.js';

/** @param {(x:number,y:number)=>number[]} f */
function img(f, w = 64, h = 64) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a.set([...f(x, y), 255], (y * w + x) * 4);
  return a;
}
const YTC = 'https://yt4.ggpht.com/ytc/AIdro_abc=s64-c-k-c0x00ffffff-no-rj';

describe('最初からの文字アイコンを見分ける(0.1.101)', () => {
  it('単色の丸に白い1文字 → 文字アイコン', () => {
    const a = img((x, y) => (x > 26 && x < 38 && y > 20 && y < 44 ? [255, 255, 255] : [0, 120, 200]));
    const s = ytIconColorStats(a, 64, 64);
    expect(s.t1).toBeGreaterThan(0.8);
    expect(ytLooksLikeDefaultLetterIcon(YTC, s)).toBe(true);
  });
  it('色の多い写真 → 自分で設定した人', () => {
    const a = img((x, y) => [(x * 4) & 255, (y * 4) & 255, ((x + y) * 3) & 255]);
    expect(ytLooksLikeDefaultLetterIcon(YTC, ytIconColorStats(a, 64, 64))).toBe(false);
  });
  it('白い背景に字(書道など)は文字アイコンにしない', () => {
    const a = img((x, y) => (x > 20 && x < 44 && y > 16 && y < 48 && (x + y) % 3 === 0 ? [20, 20, 20] : [250, 250, 250]));
    expect(ytLooksLikeDefaultLetterIcon(YTC, ytIconColorStats(a, 64, 64))).toBe(false);
  });
  it('2文字・画数の多い字(背景の割合が 0.8 未満)も文字アイコン', () => {
    const a = img((x, y) => (x > 8 && x < 56 && y > 12 && y < 52 && (x + y) % 2 === 0 ? [255, 255, 255] : [230, 60, 120]));
    const s = ytIconColorStats(a, 64, 64);
    expect(s.t1).toBeLessThan(0.8);
    expect(ytLooksLikeDefaultLetterIcon(YTC, s)).toBe(true);
  });
  it('灰色の背景に明るい頭と肩(人の形の既定アイコン)→ 最初からのアイコン', () => {
    const a = img((x, y) => {
      const nx = (x - 31.5) / 32;
      const ny = (y - 31.5) / 32;
      const fig = nx * nx + (ny + 0.25) ** 2 <= 0.1 || (ny > 0.25 && (nx / 0.72) ** 2 + ((ny - 0.85) / 0.6) ** 2 <= 1);
      return fig ? [210, 210, 210] : [130, 100, 100];
    });
    expect(ytLooksLikeDefaultLetterIcon(YTC, ytIconColorStats(a, 64, 64))).toBe(false);
    expect(ytLooksLikeDefaultIcon(YTC, a, 64, 64)).toBe(true);
  });
  it('文字アイコンは人の形とは別に当たり、写真はどちらにも当たらない', () => {
    const letter = img((x, y) => (x > 26 && x < 38 && y > 20 && y < 44 ? [255, 255, 255] : [0, 120, 200]));
    const photo = img((x, y) => [(x * 4) & 255, (y * 4) & 255, ((x + y) * 3) & 255]);
    expect(ytLooksLikeDefaultIcon(YTC, letter, 64, 64)).toBe(true);
    expect(ytLooksLikeDefaultIcon(YTC, photo, 64, 64)).toBe(false);
  });
  it('/ytc/ が無い URL は単色でも文字アイコンにしない', () => {
    const a = img(() => [0, 120, 200]);
    expect(ytLooksLikeDefaultLetterIcon('https://yt4.ggpht.com/abc=s64', ytIconColorStats(a, 64, 64))).toBe(false);
  });
  it('大きさ違いの URL は同じ鍵', () => {
    expect(ytIconCacheKey(YTC)).toBe(ytIconCacheKey(YTC.replace('=s64', '=s88')));
  });
  it('まだ分からない顔・YouTube 以外の顔は false(りんく欄のまま)', () => {
    const j = makeYtDefaultIconJudge(null);
    expect(j.isDefault('https://example.com/ytc/a.png')).toBe(false);
    j.merge({ [ytIconCacheKey(YTC)]: 1 });
    expect(j.isDefault(YTC)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { ytIconColorStats, ytLooksLikeDefaultLetterIcon, ytIconCacheKey, makeYtDefaultIconJudge } from '../../../extension-youtube/src/ytDefaultIcon.js';

/** @param {(x:number,y:number)=>number[]} f */
function img(f, w = 64, h = 64) {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a.set([...f(x, y), 255], (y * w + x) * 4);
  return a;
}
const YTC = 'https://yt4.ggpht.com/ytc/AIdro_abc=s64-c-k-c0x00ffffff-no-rj';

describe('最初からの文字アイコンを見分ける(0.1.99)', () => {
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

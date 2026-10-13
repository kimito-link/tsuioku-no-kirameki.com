import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { identiconFallbackForAvatarUrl } from './avatarFallbackFromUrl.js';
import { anonymousIdenticonDataUrl } from './anonymousIdenticon.js';

/**
 * POP と会場で「サムネが出ない人」の代替顔を揃える(2026-10-13)。
 *   旧: POP=公式の白丸(blank.jpg) / 会場=その人ごとのゆっくり顔 → 同じ人が面によって違う顔。
 */
describe('identiconFallbackForAvatarUrl', () => {
  it('★usericon の URL から uid を取り出し、その人ごとのゆっくり顔(identicon 64px)を返す', () => {
    const url = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/791/7913606.jpg';
    expect(identiconFallbackForAvatarUrl(url)).toBe(anonymousIdenticonDataUrl('7913606', 64));
    expect(identiconFallbackForAvatarUrl(url)).toMatch(/^data:image\/svg\+xml/);
  });

  it('★別の人には別の顔(全員同じ白丸にならない)', () => {
    const a = identiconFallbackForAvatarUrl('https://x/nicoaccount/usericon/s/1/12345.jpg');
    const b = identiconFallbackForAvatarUrl('https://x/nicoaccount/usericon/s/1/12346.jpg');
    expect(a).not.toBe(b);
  });

  it('★s/m のサイズ表記あり・なし、大文字小文字どちらも取れる', () => {
    const want = anonymousIdenticonDataUrl('424242', 64);
    for (const u of [
      'https://x/nicoaccount/usericon/s/42/424242.jpg',
      'https://x/nicoaccount/usericon/m/42/424242.jpg',
      'https://x/nicoaccount/usericon/42/424242.jpg',
      'https://x/NICOACCOUNT/USERICON/S/42/424242.JPG?1700000000'
    ]) expect(identiconFallbackForAvatarUrl(u)).toBe(want);
  });

  it('★uid が取れない URL・空・不正値は空文字(呼び出し側の共通 fallback へ倒れる=必ず何か出る)', () => {
    for (const u of ['', null, undefined, 'https://x/nicoaccount/usericon/defaults/blank.jpg', 'https://example.com/a.png', 12345]) {
      expect(identiconFallbackForAvatarUrl(u)).toBe('');
    }
  });
});

describe('配線: POP も会場も同じ代替顔を使う(二重に決めない)', () => {
  const read = (p) => fs.readFileSync(path.resolve(p), 'utf8').split('\r\n').join('\n');
  const pop = read('src/extension/popup-entry.js');
  const venue = read('src/extension/venueBar.js');

  it('★POP の avatar guard が共通の代替解決器を持つ', () => {
    const i = pop.indexOf('const storyAvatarLoadGuard = createSupportAvatarLoadGuard({');
    expect(i).toBeGreaterThan(0);
    expect(pop.slice(i, i + 700)).toMatch(/fallbackSrcFor: identiconFallbackForAvatarUrl,/);
    expect(pop).toMatch(/import \{ identiconFallbackForAvatarUrl \} from '\.\.\/lib\/avatarFallbackFromUrl\.js';/);
  });

  it('★会場の avatar guard も同じ関数を使う(ローカルに別実装を持たない)', () => {
    expect(venue).toMatch(/const venueAvatarFallbackFor = identiconFallbackForAvatarUrl;/);
    expect(venue).toMatch(/fallbackSrcFor: venueAvatarFallbackFor,/);
    expect(venue.includes('/usericon/(?:[sm]/)?')).toBe(false); // uid 抽出の正規表現を会場に持ち込み直していない
  });
});

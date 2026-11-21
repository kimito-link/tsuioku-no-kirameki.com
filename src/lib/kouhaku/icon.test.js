import { describe, expect, it } from 'vitest';
import { BLANK_ICON_URL, deriveKouhakuIconUrl, iconUrlForEntry, officialIconUrl } from './icon.js';

describe('紅白の配信者アイコン', () => {
  it('ユーザーIDから公開CDNのURLを作る', () => {
    expect(deriveKouhakuIconUrl('41979749')).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/4197/41979749.jpg'
    );
    expect(deriveKouhakuIconUrl('99')).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/0/99.jpg'
    );
    expect(deriveKouhakuIconUrl('10000')).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/1/10000.jpg'
    );
  });

  it('数字でないIDは導出しない', () => {
    expect(deriveKouhakuIconUrl('')).toBe('');
    expect(deriveKouhakuIconUrl('a:184')).toBe('');
    expect(deriveKouhakuIconUrl('12 3')).toBe('');
  });

  it('公式ページの usericon だけを残し、それ以外は捨てる', () => {
    const official = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/14415/144158487.jpg';
    expect(officialIconUrl(official)).toBe(official);
    expect(officialIconUrl('https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/4197/41979749.jpg')).toBe(
      'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/4197/41979749.jpg'
    );
    expect(officialIconUrl('https://blog.nicovideo.jp/wp-content/themes/nicoinfo/images/niconicoinfo_logo.png')).toBe('');
    expect(officialIconUrl('http://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/1/10000.jpg')).toBe('');
    expect(officialIconUrl('https://evil.example/usericon/1/1.jpg')).toBe('');
    expect(officialIconUrl('javascript:alert(1)')).toBe('');
  });

  it('公式URLが無い・壊れているときは導出、それも無理なら空白アイコン', () => {
    expect(iconUrlForEntry({ userId: '41979749', iconUrl: null })).toBe(deriveKouhakuIconUrl('41979749'));
    expect(iconUrlForEntry({
      userId: '41979749',
      iconUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/4197/41979749.jpg'
    })).toBe('https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/4197/41979749.jpg');
    expect(iconUrlForEntry({ userId: '41979749', iconUrl: 'https://evil.example/a.jpg' })).toBe(
      deriveKouhakuIconUrl('41979749')
    );
    expect(iconUrlForEntry({ userId: '', iconUrl: '' })).toBe(BLANK_ICON_URL);
    expect(BLANK_ICON_URL).toBe('https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg');
  });
});

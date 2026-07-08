import { describe, expect, it } from 'vitest';
import { enrichVenueRowsWithProfileAvatars } from './venueAvatar.js';

const NICO_ICON = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/103/10340018.jpg';

describe('enrichVenueRowsWithProfileAvatars', () => {
  it('avatar が空の行をプロファイルキャッシュの avatarUrl で補強する', () => {
    const rows = [{ userId: '10340018', name: '隣の家のねこ', avatar: '', capturedAt: 100 }];
    const profileMap = { 10340018: { avatarUrl: NICO_ICON } };
    const out = enrichVenueRowsWithProfileAvatars(rows, profileMap);
    expect(out[0].avatar).toBe(NICO_ICON);
    expect(out[0].avatarObserved).toBe(true);
  });

  it('既に avatar(http)がある行はそのまま・observed true', () => {
    const rows = [{ userId: '1', name: 'A', avatar: NICO_ICON, capturedAt: 1 }];
    const out = enrichVenueRowsWithProfileAvatars(rows, {});
    expect(out[0].avatar).toBe(NICO_ICON);
    expect(out[0].avatarObserved).toBe(true);
  });

  it('URL埋め込みuidとエントリuidが食い違う取り違えは弾く(配信者アイコン混入防止)', () => {
    // profileMap の avatarUrl が uid=10340018 のものなのに、エントリは別人(999)
    const rows = [{ userId: '999', name: 'べつじん', avatar: '', capturedAt: 1 }];
    const profileMap = { 999: { avatarUrl: NICO_ICON } };
    const out = enrichVenueRowsWithProfileAvatars(rows, profileMap);
    expect(out[0].avatar).toBe(''); // 取り違えなので採用しない
    expect(out[0].avatarObserved).toBe(false);
  });

  it('プロファイルにサムネが無い人は avatar 空のまま(=会場側でゆっくり顔生成)', () => {
    const rows = [{ userId: 'a:abc', name: '', avatar: '', capturedAt: 1 }];
    const out = enrichVenueRowsWithProfileAvatars(rows, {});
    expect(out[0].avatar).toBe('');
    expect(out[0].avatarObserved).toBe(false);
    expect(out[0].userId).toBe('a:abc'); // 匿名も行は保持(観客席で顔つきにする)
  });

  it('data URL は http でないので observed 扱いしない(プロファイル補強の対象)', () => {
    const rows = [{ userId: '10340018', name: 'X', avatar: 'data:image/svg+xml;...', capturedAt: 1 }];
    const out = enrichVenueRowsWithProfileAvatars(rows, { 10340018: { avatarUrl: NICO_ICON } });
    // data URL を上書きして実サムネを優先(http が取れたら本物を出す)
    expect(out[0].avatar).toBe(NICO_ICON);
    expect(out[0].avatarObserved).toBe(true);
  });

  it('preCount/preHasGift/preGiftCount 等の未知フィールドを保持する(VIP常連光らせの契約・v0.1.734の轍)', () => {
    const rows = [
      {
        userId: '10340018',
        name: '常連さん',
        avatar: '',
        capturedAt: 100,
        preCount: 7,
        preHasGift: true,
        preGiftCount: 2
      }
    ];
    const out = enrichVenueRowsWithProfileAvatars(rows, { 10340018: { avatarUrl: NICO_ICON } });
    expect(out[0].avatar).toBe(NICO_ICON);
    expect(out[0].preCount).toBe(7);
    expect(out[0].preHasGift).toBe(true);
    expect(out[0].preGiftCount).toBe(2);
  });

  it('非配列・不正要素を安全に無視', () => {
    expect(enrichVenueRowsWithProfileAvatars(null, {})).toEqual([]);
    expect(enrichVenueRowsWithProfileAvatars([null, {}], null)).toEqual([
      { userId: '', name: '', avatar: '', text: '', capturedAt: 0, avatarObserved: false }
    ]);
  });
});

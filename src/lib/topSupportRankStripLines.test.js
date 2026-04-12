import { describe, it, expect } from 'vitest';
import {
  accentColorForSlot,
  accentSlotFromUserKey
} from './userSupportGridAccent.js';
import { UNKNOWN_USER_KEY } from './userRooms.js';
import { niconicoDefaultUserIconUrl } from './supportGrowthTileSrc.js';
import { topSupportRankLineModels } from './topSupportRankStripLines.js';

const DEF_THUMB = 'images/yukkuri-default.png';

describe('topSupportRankLineModels', () => {
  it('空配列は空', () => {
    expect(topSupportRankLineModels([], { defaultThumbSrc: DEF_THUMB })).toEqual(
      []
    );
  });

  it('unknown のみの行は placeNumber が null', () => {
    const [row] = topSupportRankLineModels(
      [
        {
          userKey: UNKNOWN_USER_KEY,
          nickname: '',
          count: 242
        }
      ],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(row.isUnknown).toBe(true);
    expect(row.placeNumber).toBeNull();
    expect(row.idShort).toBe('—');
    expect(row.nameLine).toBe('—');
    expect(row.count).toBe(242);
  });

  it('先頭 unknown の次の known が順位 1', () => {
    const rows = topSupportRankLineModels(
      [
        { userKey: UNKNOWN_USER_KEY, nickname: '', count: 10 },
        { userKey: 'a:abc', nickname: 'n', count: 5 }
      ],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(rows[0].placeNumber).toBeNull();
    expect(rows[1].placeNumber).toBe(1);
  });

  it('known が2人で順位 1 と 2', () => {
    const rows = topSupportRankLineModels(
      [
        { userKey: '11111', nickname: 'A', count: 100 },
        { userKey: '22222', nickname: 'B', count: 50 }
      ],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(rows[0].placeNumber).toBe(1);
    expect(rows[1].placeNumber).toBe(2);
  });

  it('known が10人で順位 1〜10（ストリップ上限と整合）', () => {
    const rooms = Array.from({ length: 10 }, (_, i) => ({
      userKey: String(10000 + i),
      nickname: `U${i}`,
      count: 100 - i
    }));
    const rows = topSupportRankLineModels(rooms, { defaultThumbSrc: DEF_THUMB });
    expect(rows).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect(rows[i].placeNumber).toBe(i + 1);
    }
  });

  it('先頭 unknown のあと known が10人で順位 1〜10', () => {
    const rooms = [
      { userKey: UNKNOWN_USER_KEY, nickname: '', count: 999 },
      ...Array.from({ length: 10 }, (_, i) => ({
        userKey: String(20000 + i),
        nickname: `U${i}`,
        count: 100 - i
      }))
    ];
    const rows = topSupportRankLineModels(rooms, { defaultThumbSrc: DEF_THUMB });
    expect(rows).toHaveLength(11);
    expect(rows[0].placeNumber).toBeNull();
    for (let i = 0; i < 10; i++) {
      expect(rows[i + 1].placeNumber).toBe(i + 1);
    }
  });

  it('avatarUrl が非 http のとき数字IDはニコ既定 usericon', () => {
    const [row] = topSupportRankLineModels(
      [
        {
          userKey: '86255751',
          nickname: 'x',
          count: 1,
          avatarUrl: 'relative.png'
        }
      ],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(row.thumbSrc).toBe(niconicoDefaultUserIconUrl('86255751'));
    expect(row.thumbNeedsNoReferrer).toBe(true);
  });

  it('匿名IDで http サムネが無いとき anonymousFallbackThumbSrc を使う', () => {
    const tv = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/tv.jpg';
    const [row] = topSupportRankLineModels(
      [
        {
          userKey: 'a:AXaKZ_4ShxQHJVsX',
          nickname: '',
          count: 3,
          avatarUrl: ''
        }
      ],
      { defaultThumbSrc: DEF_THUMB, anonymousFallbackThumbSrc: tv }
    );
    expect(row.thumbSrc).toBe(tv);
    expect(row.thumbNeedsNoReferrer).toBe(true);
  });

  it('anonymousIdenticonResolver が返す data URL を匿名のサムネに使う', () => {
    const tv = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/tv.jpg';
    const idn = 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E';
    const [row] = topSupportRankLineModels(
      [
        {
          userKey: 'a:AXaKZ_4ShxQHJVsX',
          nickname: '',
          count: 3,
          avatarUrl: ''
        }
      ],
      {
        defaultThumbSrc: DEF_THUMB,
        anonymousFallbackThumbSrc: tv,
        anonymousIdenticonResolver: () => idn
      }
    );
    expect(row.thumbSrc).toBe(idn);
    expect(row.thumbNeedsNoReferrer).toBe(false);
  });

  it('resolver が空を返したら従来フォールバック', () => {
    const tv = 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/tv.jpg';
    const [row] = topSupportRankLineModels(
      [
        {
          userKey: 'a:AXaKZ_4ShxQHJVsX',
          nickname: '',
          count: 3,
          avatarUrl: ''
        }
      ],
      {
        defaultThumbSrc: DEF_THUMB,
        anonymousFallbackThumbSrc: tv,
        anonymousIdenticonResolver: () => ''
      }
    );
    expect(row.thumbSrc).toBe(tv);
  });

  it('https avatar はその URL と no-referrer フラグ', () => {
    const [row] = topSupportRankLineModels(
      [
        {
          userKey: '86255751',
          nickname: 'x',
          count: 1,
          avatarUrl: 'https://cdn.example/u.jpg'
        }
      ],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(row.thumbSrc).toBe('https://cdn.example/u.jpg');
    expect(row.thumbNeedsNoReferrer).toBe(true);
  });

  it('known はアクセント色が accentColorForSlot と一致', () => {
    const key = '86255751';
    const slot = accentSlotFromUserKey(key);
    const expected =
      slot != null ? accentColorForSlot(slot, 'light') : null;
    const [row] = topSupportRankLineModels(
      [{ userKey: key, nickname: 'nick', count: 3 }],
      { defaultThumbSrc: DEF_THUMB, colorScheme: 'light' }
    );
    expect(row.hasAccent).toBe(true);
    expect(row.accentColorCss).toBe(expected);
  });

  it('dark scheme で色が light と異なる（スロット同じでもパレット違い）', () => {
    const key = '86255751';
    const [light] = topSupportRankLineModels(
      [{ userKey: key, nickname: '', count: 1 }],
      { defaultThumbSrc: DEF_THUMB, colorScheme: 'light' }
    );
    const [dark] = topSupportRankLineModels(
      [{ userKey: key, nickname: '', count: 1 }],
      { defaultThumbSrc: DEF_THUMB, colorScheme: 'dark' }
    );
    expect(light.accentColorCss).toBeTruthy();
    expect(dark.accentColorCss).toBeTruthy();
    expect(light.accentColorCss).not.toBe(dark.accentColorCss);
  });

  it('ニックなしの known は名前行が（未取得）', () => {
    const [row] = topSupportRankLineModels(
      [{ userKey: '99999999', nickname: '', count: 7 }],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(row.nameLine).toBe('（未取得）');
  });

  it('匿名IDでニック空は名前行が匿名', () => {
    const [row] = topSupportRankLineModels(
      [{ userKey: 'a:AXaKZ_4ShxQHJVsX', nickname: '', count: 3 }],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(row.nameLine).toBe('匿名');
  });

  it('fullLabelForTitle は displayUserLabel 相当', () => {
    const [row] = topSupportRankLineModels(
      [{ userKey: '11111', nickname: '太郎', count: 1 }],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(row.fullLabelForTitle).toContain('太郎');
    expect(row.fullLabelForTitle).toContain('11111');
  });
});

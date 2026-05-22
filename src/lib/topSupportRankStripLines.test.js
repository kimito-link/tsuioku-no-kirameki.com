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

  it('__anon_<表示名> と表示名が同じとき id 行を出さない（二重表示防止）', () => {
    const [row] = topSupportRankLineModels(
      [{ userKey: '__anon_名無し', nickname: '名無し', count: 1 }],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(row.idShort).toBe('');
    expect(row.nameLine).toBe('名無し');
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

  it('ニックなしの known は名前行が u/<uid>（v0.1.181-183 互換、ペチパー fix）', () => {
    const [row] = topSupportRankLineModels(
      [{ userKey: '99999999', nickname: '', count: 7 }],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(row.nameLine).toBe('u/99999999');
  });

  it('匿名IDでニック空は名前行が匿名', () => {
    const [row] = topSupportRankLineModels(
      [{ userKey: 'a:AXaKZ_4ShxQHJVsX', nickname: '', count: 3 }],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(row.nameLine).toBe('匿名');
  });

  it('数値 uid + ニック空は u/<uid> 形式（ペチパー 507563 ケース）', () => {
    const [row] = topSupportRankLineModels(
      [{ userKey: '507563', nickname: '', count: 1 }],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(row.nameLine).toBe('u/507563');
  });

  it('数値 uid + nickname がゲスト placeholder のときも u/<uid> 形式', () => {
    const [row] = topSupportRankLineModels(
      [{ userKey: '507563', nickname: 'ゲスト', count: 1 }],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(row.nameLine).toBe('u/507563');
  });

  it('数値 uid + nickname が user XXXX placeholder のときも u/<uid> 形式', () => {
    const [row] = topSupportRankLineModels(
      [{ userKey: '507563', nickname: 'user 0539Z74OJ13', count: 1 }],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(row.nameLine).toBe('u/507563');
  });

  it('fullLabelForTitle は displayUserLabel 相当', () => {
    const [row] = topSupportRankLineModels(
      [{ userKey: '11111', nickname: '太郎', count: 1 }],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(row.fullLabelForTitle).toContain('太郎');
    expect(row.fullLabelForTitle).toContain('11111');
  });

  it('rankHint が各行にあればその順位を表示する', () => {
    const rows = topSupportRankLineModels(
      [
        { userKey: '1', nickname: 'a', count: 10, rankHint: 1 },
        { userKey: '2', nickname: 'b', count: 9, rankHint: 2 },
        { userKey: '3', nickname: 'c', count: 8, rankHint: 3 }
      ],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(rows.map((r) => r.placeNumber)).toEqual([1, 2, 3]);
  });

  it('公式スクレイプ由来 __ad_* では DOM の表示名を優先し id 行を省略する', () => {
    const [row] = topSupportRankLineModels(
      [{ userKey: '__ad_0_ゲスト', nickname: 'ゲスト', count: 1200, avatarUrl: '' }],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(row.nameLine).toBe('ゲスト');
    expect(row.idShort).toBe('');
  });

  it('公式ランキングの匿名行 __anon_ad_N は「名無し」(公式準拠)と表示し内部キーを漏らさない', () => {
    const [row] = topSupportRankLineModels(
      [{ userKey: '__anon_ad_2', nickname: '', count: 1000, avatarUrl: '' }],
      { defaultThumbSrc: DEF_THUMB }
    );
    // v0.1.317: 公式は匿名を「名無し」と表記＝レーンも公式準拠に合わせる
    expect(row.nameLine).toBe('名無し');
    // id 行・タイトルに __anon_ad_2 / u/__anon_ad_2 が出ない
    expect(row.idShort).toBe('');
    expect(row.idTitle).toBe('');
    expect(row.fullLabelForTitle).toBe('名無し');
    expect(row.nameLine).not.toContain('__anon');
    expect(row.fullLabelForTitle).not.toContain('__anon');
  });

  it('貢献度ランキングの匿名行 __anon_contrib_N も「名無し」(公式準拠)と表示する', () => {
    const [row] = topSupportRankLineModels(
      [{ userKey: '__anon_contrib_0', nickname: '', count: 50, avatarUrl: '' }],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(row.nameLine).toBe('名無し');
    expect(row.idShort).toBe('');
    expect(row.fullLabelForTitle).toBe('名無し');
  });

  it('公式ランク行 __ad_N_（名前空サフィックス）でも内部キーを漏らさず「名無し」', () => {
    // scrape が name を読めず isAnonymous も付かなかった行は __ad_N_（空サフィックス）
    // になり useOfficialDomNick=false。従来は u/__ad_N_ と内部キーが漏れていた（v0.1.315 修正）。
    const [row] = topSupportRankLineModels(
      [{ userKey: '__ad_3_', nickname: '', count: 800, avatarUrl: '' }],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(row.nameLine).toBe('名無し');
    expect(row.idShort).toBe('');
    expect(row.idTitle).toBe('');
    expect(row.fullLabelForTitle).toBe('名無し');
    expect(row.nameLine).not.toContain('__ad_');
    expect(row.fullLabelForTitle).not.toContain('__ad_');
  });

  it('貢献度 __contrib_N_（名前空）でも「名無し」で内部キー漏れなし', () => {
    const [row] = topSupportRankLineModels(
      [{ userKey: '__contrib_5_', nickname: '', count: 30, avatarUrl: '' }],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(row.nameLine).toBe('名無し');
    expect(row.fullLabelForTitle).toBe('名無し');
    expect(row.nameLine).not.toContain('u/');
  });

  it('名前付き __ad_N_名前 は公式名のみ（title に内部キーを括弧表示しない）', () => {
    const [row] = topSupportRankLineModels(
      [{ userKey: '__ad_0_ゲスト', nickname: 'ゲスト', count: 1200, avatarUrl: '' }],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(row.nameLine).toBe('ゲスト');
    expect(row.idShort).toBe('');
    // 旧 displayUserLabel だと「ゲスト（__ad_0_ゲスト）」と内部キーが括弧で出ていた
    expect(row.fullLabelForTitle).toBe('ゲスト');
    expect(row.fullLabelForTitle).not.toContain('__ad_');
  });

  it('placeNumberMode:dense で同回数は同順位（本家ランキングタブの貢献度に近い並び方）', () => {
    const rooms = [
      { userKey: '1', nickname: 'a', count: 40 },
      { userKey: '2', nickname: 'b', count: 10 },
      { userKey: '3', nickname: 'c', count: 10 },
      { userKey: '4', nickname: 'd', count: 10 },
      { userKey: '5', nickname: 'e', count: 5 },
      { userKey: '6', nickname: 'f', count: 5 }
    ];
    const rows = topSupportRankLineModels(rooms, {
      defaultThumbSrc: DEF_THUMB,
      placeNumberMode: 'dense'
    });
    expect(rows.map((r) => r.placeNumber)).toEqual([1, 2, 2, 2, 3, 3]);
  });

  it('placeNumberMode:dense で先頭 unknown のあと known は 1 から', () => {
    const rows = topSupportRankLineModels(
      [
        { userKey: UNKNOWN_USER_KEY, nickname: '', count: 999 },
        { userKey: '1', nickname: 'a', count: 40 },
        { userKey: '2', nickname: 'b', count: 10 }
      ],
      { defaultThumbSrc: DEF_THUMB, placeNumberMode: 'dense' }
    );
    expect(rows[0].placeNumber).toBeNull();
    expect(rows[1].placeNumber).toBe(1);
    expect(rows[2].placeNumber).toBe(2);
  });

  it('placeNumberMode:dense で先頭同率は同じ 1 位', () => {
    const rows = topSupportRankLineModels(
      [
        { userKey: '1', nickname: 'a', count: 7 },
        { userKey: '2', nickname: 'b', count: 7 }
      ],
      { defaultThumbSrc: DEF_THUMB, placeNumberMode: 'dense' }
    );
    expect(rows[0].placeNumber).toBe(1);
    expect(rows[1].placeNumber).toBe(1);
  });
});

describe('公式DOMランキング サムネかぶり対策（v0.1.282）', () => {
  /** @param {number} n */
  const adRows = (n) =>
    Array.from({ length: n }, (_, i) => ({
      userKey: `__ad_${i}_advertiser${i}`,
      nickname: `advertiser${i}`,
      count: 100 - i,
      avatarUrl: ''
    }));

  it('cond3 一意性: 空サムネ広告5行が全行ユニークな中立バッジ（Set=行数）', () => {
    const models = topSupportRankLineModels(adRows(5), {
      defaultThumbSrc: DEF_THUMB
      // anonymousIdenticonResolver 無し（トグル OFF 相当）
    });
    const thumbs = models.map((m) => m.thumbSrc);
    expect(new Set(thumbs).size).toBe(5);
    for (const t of thumbs) {
      expect(t.startsWith('data:image/svg+xml,')).toBe(true);
      expect(t).not.toBe(DEF_THUMB);
    }
  });

  it('cond1 トグル分離: resolver 有無で結果が同一（トグル非依存の中立バッジ）', () => {
    const off = topSupportRankLineModels(adRows(4), {
      defaultThumbSrc: DEF_THUMB
    }).map((m) => m.thumbSrc);
    const on = topSupportRankLineModels(adRows(4), {
      defaultThumbSrc: DEF_THUMB,
      anonymousIdenticonResolver: (uid) => `data:identicon/${uid}`
    }).map((m) => m.thumbSrc);
    expect(on).toEqual(off); // identicon に化けず、トグル ON/OFF で不変
    expect(on.every((t) => t.startsWith('data:image/svg+xml,'))).toBe(true);
  });

  it('cond2a 退行ゼロ: 実 http サムネ行は最優先で不変', () => {
    const url = 'https://example.com/real-advertiser.png';
    const [m] = topSupportRankLineModels(
      [{ userKey: '__ad_0_utero', nickname: 'utero', count: 999, avatarUrl: url }],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(m.thumbSrc).toBe(url);
  });

  it('cond2c 退行ゼロ: __gift_ / 数値uid / UNKNOWN は中立バッジにしない', () => {
    const [gift] = topSupportRankLineModels(
      [{ userKey: '__gift_0_sender', nickname: 'sender', count: 5, avatarUrl: '' }],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(gift.thumbSrc).toBe(DEF_THUMB);
    expect(gift.thumbSrc.startsWith('data:image/svg+xml,')).toBe(false);

    const [numeric] = topSupportRankLineModels(
      [{ userKey: '12345678', nickname: 'n', count: 5, avatarUrl: '' }],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(numeric.thumbSrc).toBe(niconicoDefaultUserIconUrl('12345678'));

    const [unk] = topSupportRankLineModels(
      [{ userKey: UNKNOWN_USER_KEY, nickname: '', count: 1 }],
      { defaultThumbSrc: DEF_THUMB }
    );
    expect(unk.thumbSrc.startsWith('data:image/svg+xml,')).toBe(false);
  });

  it('貢献度 __contrib_ も同様に行別中立バッジ（旧かぶり→解消）', () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      userKey: `__contrib_${i}_user${i}`,
      nickname: `user${i}`,
      count: 50 - i,
      avatarUrl: ''
    }));
    const thumbs = topSupportRankLineModels(rows, {
      defaultThumbSrc: DEF_THUMB
    }).map((m) => m.thumbSrc);
    expect(new Set(thumbs).size).toBe(3);
    expect(thumbs.every((t) => t.startsWith('data:image/svg+xml,'))).toBe(true);
  });

  it('順位番号が同値でも userKey ハッシュで byte 一意（匿名広告行）', () => {
    const rows = [
      { userKey: '__anon_ad_0', nickname: '', count: 10, avatarUrl: '' },
      { userKey: '__anon_ad_1', nickname: '', count: 10, avatarUrl: '' }
    ];
    const thumbs = topSupportRankLineModels(rows, {
      defaultThumbSrc: DEF_THUMB
    }).map((m) => m.thumbSrc);
    expect(thumbs[0]).not.toBe(thumbs[1]);
    expect(new Set(thumbs).size).toBe(2);
  });
});

describe('公式DOMランキング 同一実URL重複の解消（v0.1.282 実機 1-3位かぶり）', () => {
  const DUP = 'https://example.com/scrape-artifact.jpg';

  it('上位3行が同一実URL（scrapeアーティファクト）→ 全て中立バッジ・実URL不採用', () => {
    const rows = [
      { userKey: '__ad_0_a', nickname: 'a', count: 21200, avatarUrl: DUP },
      { userKey: '__ad_1_b', nickname: 'b', count: 6600, avatarUrl: DUP },
      { userKey: '__ad_2_c', nickname: 'c', count: 5047, avatarUrl: DUP },
      { userKey: '__ad_3_d', nickname: 'd', count: 3690, avatarUrl: '' },
      { userKey: '__ad_4_e', nickname: 'e', count: 3200, avatarUrl: '' }
    ];
    const thumbs = topSupportRankLineModels(rows, {
      defaultThumbSrc: DEF_THUMB
    }).map((m) => m.thumbSrc);
    // 重複実URLは1つも採用されない
    for (const t of thumbs) expect(t).not.toBe(DUP);
    // 全行が中立バッジ（data URL）かつ全行ユニーク（かぶり解消）
    expect(thumbs.every((t) => t.startsWith('data:image/svg+xml,'))).toBe(true);
    expect(new Set(thumbs).size).toBe(5);
  });

  it('一意な実URLの公式ランク行はそのまま実URLを使う（誤爆しない）', () => {
    const rows = [
      { userKey: '__ad_0_a', nickname: 'a', count: 100, avatarUrl: DUP },
      { userKey: '__ad_1_b', nickname: 'b', count: 90, avatarUrl: DUP },
      {
        userKey: '__ad_2_c',
        nickname: 'c',
        count: 80,
        avatarUrl: 'https://example.com/unique-real.jpg'
      }
    ];
    const thumbs = topSupportRankLineModels(rows, {
      defaultThumbSrc: DEF_THUMB
    }).map((m) => m.thumbSrc);
    expect(thumbs[0]).not.toBe(DUP); // 重複は中立バッジ
    expect(thumbs[1]).not.toBe(DUP);
    expect(thumbs[2]).toBe('https://example.com/unique-real.jpg'); // 一意は実URL維持
  });

  it('非公式ランク（数値uid等）の同一URLは dedup 対象外＝従来どおり実URL維持', () => {
    const rows = [
      { userKey: '12345678', nickname: 'x', count: 5, avatarUrl: DUP },
      { userKey: '87654321', nickname: 'y', count: 4, avatarUrl: DUP }
    ];
    const thumbs = topSupportRankLineModels(rows, {
      defaultThumbSrc: DEF_THUMB
    }).map((m) => m.thumbSrc);
    expect(thumbs[0]).toBe(DUP);
    expect(thumbs[1]).toBe(DUP);
  });
});

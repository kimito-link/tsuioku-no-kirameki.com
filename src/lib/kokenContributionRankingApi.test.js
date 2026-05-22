import { describe, it, expect } from 'vitest';
import {
  KOKEN_CONTRIB_FETCH_MESSAGE_TYPE,
  KOKEN_CONTRIB_STORAGE_PREFIX,
  buildKokenContributionRankingUrl,
  isLikelyKokenRankingShape,
  kokenContribStorageKey,
  normalizeKokenRankingResponse
} from './kokenContributionRankingApi.js';

// 実 API（lv350522273）で確証したレスポンス概形を模した一次資料相当のサンプル。
const REAL_SHAPED = {
  meta: { status: 200 },
  data: {
    rankers: [
      {
        rank: 1,
        supporterId: 130688509,
        supporterName: '御用',
        supporterThumbnailUrl:
          'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/13068/130688509.jpg?1772616652',
        contribution: 51000,
        userPageUrl: 'https://www.nicovideo.jp/user/130688509'
      },
      {
        // 匿名（supporterId / userPageUrl 欠落・名無し・blank.jpg）
        rank: 3,
        supporterName: '名無し',
        supporterThumbnailUrl:
          'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg',
        contribution: 3000
      }
    ]
  }
};

describe('KOKEN_CONTRIB_FETCH_MESSAGE_TYPE', () => {
  it('background.js と文字列同期している契約値', () => {
    // background.js は本定数を import できない手書き成果物のため、値が変わると
    // SW 連携が静かに壊れる。契約として固定する。
    expect(KOKEN_CONTRIB_FETCH_MESSAGE_TYPE).toBe('NLS_KOKEN_CONTRIB_FETCH');
  });
});

describe('kokenContribStorageKey', () => {
  it('liveId を小文字化して固定 prefix のキーにする（3 箇所で同一契約）', () => {
    expect(kokenContribStorageKey('lv350522273')).toBe(
      'nls_koken_api_contrib_lv350522273'
    );
    expect(kokenContribStorageKey('  LV1  ')).toBe('nls_koken_api_contrib_lv1');
    expect(kokenContribStorageKey(null)).toBe('nls_koken_api_contrib_');
    expect(kokenContribStorageKey('lv9').startsWith(KOKEN_CONTRIB_STORAGE_PREFIX)).toBe(
      true
    );
    // relay の既存キーとは別系統（clobber 不能の構造保証）
    expect(KOKEN_CONTRIB_STORAGE_PREFIX).not.toContain('iframe_official_dom');
  });
});

describe('buildKokenContributionRankingUrl', () => {
  it('正しい liveId → 既定 rank=20 の公式 gift エンドポイント', () => {
    expect(buildKokenContributionRankingUrl('lv350522273')).toBe(
      'https://api.koken.nicovideo.jp/v1/userperspective/contents/gift/live/lv350522273/ranking?rank=20'
    );
  });

  it('rank を渡すと反映し、1..100 に clamp、整数化', () => {
    expect(buildKokenContributionRankingUrl('lv1', { rank: 10 })).toContain(
      'ranking?rank=10'
    );
    expect(buildKokenContributionRankingUrl('lv1', { rank: 0 })).toContain(
      'ranking?rank=1'
    );
    expect(buildKokenContributionRankingUrl('lv1', { rank: 9999 })).toContain(
      'ranking?rank=100'
    );
    expect(buildKokenContributionRankingUrl('lv1', { rank: 12.9 })).toContain(
      'ranking?rank=12'
    );
  });

  it('不正 liveId / 注入試行 / 非文字列 → null（SSRF・任意 URL fetch 防止）', () => {
    for (const bad of [
      '',
      '   ',
      'abc',
      'lv',
      'LV123',
      'lv12a',
      'lv1/../../evil',
      'lv1?x=1',
      'https://evil.example/lv1',
      'lv 1',
      null,
      undefined,
      123,
      {},
      'lv' + '1'.repeat(20)
    ]) {
      expect(
        buildKokenContributionRankingUrl(/** @type {any} */ (bad))
      ).toBeNull();
    }
  });
});

describe('isLikelyKokenRankingShape', () => {
  it('正常形 → true（meta 省略でも data.rankers 配列なら true）', () => {
    expect(isLikelyKokenRankingShape(REAL_SHAPED)).toBe(true);
    expect(isLikelyKokenRankingShape({ data: { rankers: [] } })).toBe(true);
  });

  it('meta.status!==200 / data 欠落 / rankers 非配列 / 非オブジェクト → false', () => {
    expect(
      isLikelyKokenRankingShape({ meta: { status: 404 }, data: { rankers: [] } })
    ).toBe(false);
    expect(
      isLikelyKokenRankingShape({
        meta: { status: 401, errorCode: 'NICOAD_9_1' }
      })
    ).toBe(false);
    expect(isLikelyKokenRankingShape({ data: {} })).toBe(false);
    expect(isLikelyKokenRankingShape({ data: { rankers: 'x' } })).toBe(false);
    expect(isLikelyKokenRankingShape(null)).toBe(false);
    expect(isLikelyKokenRankingShape('str')).toBe(false);
    expect(isLikelyKokenRankingShape(undefined)).toBe(false);
  });
});

describe('normalizeKokenRankingResponse', () => {
  it('実形サンプル → ContributionRankerRow[]（記名 + 匿名、スキーマ一致）', () => {
    const rows = normalizeKokenRankingResponse(REAL_SHAPED);
    expect(rows).toEqual([
      {
        rank: 1,
        name: '御用',
        contribution: 51000,
        isAnonymous: false,
        thumbnailUrl:
          'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/13068/130688509.jpg?1772616652',
        userPageUrl: 'https://www.nicovideo.jp/user/130688509'
      },
      {
        rank: 3,
        name: '名無し',
        contribution: 3000,
        isAnonymous: true,
        thumbnailUrl:
          'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg'
      }
    ]);
  });

  it('不正 liveId / 配信なしの 200+rankers:[] → null（fail-soft で既存値保全）', () => {
    expect(
      normalizeKokenRankingResponse({ meta: { status: 200 }, data: { rankers: [] } })
    ).toBeNull();
  });

  it('meta.status!==200 → null（既存値を上書きさせない）', () => {
    expect(
      normalizeKokenRankingResponse({ meta: { status: 404 }, data: { rankers: [] } })
    ).toBeNull();
    expect(normalizeKokenRankingResponse(null)).toBeNull();
    expect(normalizeKokenRankingResponse('x')).toBeNull();
    expect(normalizeKokenRankingResponse({})).toBeNull();
  });

  it('匿名判定: supporterId 欠落 or "名無し" は isAnonymous、空名は "名無し" に倒す', () => {
    const rows = normalizeKokenRankingResponse({
      data: {
        rankers: [
          { rank: 1, supporterName: '', contribution: 10 }, // 匿名・空名 → 名無し
          { rank: 2, supporterId: 7, supporterName: '名無し', contribution: 5 } // 名が名無し → 匿名扱い
        ]
      }
    });
    expect(rows).toEqual([
      { rank: 1, name: '名無し', contribution: 10, isAnonymous: true, thumbnailUrl: '' },
      { rank: 2, name: '名無し', contribution: 5, isAnonymous: true, thumbnailUrl: '' }
    ]);
  });

  it('記名なのに名前が空の壊れた行は捨てる', () => {
    const rows = normalizeKokenRankingResponse({
      data: {
        rankers: [
          { rank: 1, supporterId: 42, supporterName: '   ', contribution: 9 },
          { rank: 2, supporterId: 43, supporterName: 'ありな', contribution: 8 }
        ]
      }
    });
    expect(rows).toEqual([
      {
        rank: 2,
        name: 'ありな',
        contribution: 8,
        isAnonymous: false,
        thumbnailUrl: '',
        userPageUrl: 'https://www.nicovideo.jp/user/43'
      }
    ]);
  });

  it('contribution 非数値/負値 → 0、整数化。thumbnail は http(s) 以外を空に倒す', () => {
    const rows = normalizeKokenRankingResponse({
      data: {
        rankers: [
          {
            rank: 1,
            supporterId: 1,
            supporterName: 'a',
            contribution: 'NaN',
            supporterThumbnailUrl: 'javascript:alert(1)'
          },
          {
            rank: 2,
            supporterId: 2,
            supporterName: 'b',
            contribution: -50,
            supporterThumbnailUrl: 'http://example.com/x.png'
          },
          { rank: 3, supporterId: 3, supporterName: 'c', contribution: 12.7 }
        ]
      }
    });
    expect(rows).toEqual([
      {
        rank: 1,
        name: 'a',
        contribution: 0,
        isAnonymous: false,
        thumbnailUrl: '',
        userPageUrl: 'https://www.nicovideo.jp/user/1'
      },
      {
        rank: 2,
        name: 'b',
        contribution: 0,
        isAnonymous: false,
        thumbnailUrl: 'http://example.com/x.png',
        userPageUrl: 'https://www.nicovideo.jp/user/2'
      },
      {
        rank: 3,
        name: 'c',
        contribution: 12,
        isAnonymous: false,
        thumbnailUrl: '',
        userPageUrl: 'https://www.nicovideo.jp/user/3'
      }
    ]);
  });

  it('rank 欠落/不正は index+1 に補正、同点同 rank とサーバ順を保持（再ソートしない）', () => {
    const rows = normalizeKokenRankingResponse({
      data: {
        rankers: [
          { supporterId: 1, supporterName: 'x', contribution: 100 }, // rank 無 → 1
          { rank: 0, supporterId: 2, supporterName: 'y', contribution: 100 }, // 不正 → 2
          { rank: 2, supporterId: 3, supporterName: 'z', contribution: 60 }, // 同点でなくとも値尊重
          { rank: 2, supporterId: 4, supporterName: 'w', contribution: 60 } // 同 rank=2 保持
        ]
      }
    });
    expect(rows.map((r) => [r.rank, r.name])).toEqual([
      [1, 'x'],
      [2, 'y'],
      [2, 'z'],
      [2, 'w']
    ]);
  });

  it('rankers 内の非オブジェクト要素は安全に skip', () => {
    const rows = normalizeKokenRankingResponse({
      data: {
        rankers: [
          null,
          'bad',
          42,
          { rank: 1, supporterId: 9, supporterName: 'ok', contribution: 1 }
        ]
      }
    });
    expect(rows).toEqual([
      {
        rank: 1,
        name: 'ok',
        contribution: 1,
        isAnonymous: false,
        thumbnailUrl: '',
        userPageUrl: 'https://www.nicovideo.jp/user/9'
      }
    ]);
  });

  it('v0.1.316: userPageUrl は公式値を優先、無ければ supporterId 由来、匿名は付けない', () => {
    const rows = normalizeKokenRankingResponse({
      data: {
        rankers: [
          // 公式 userPageUrl あり → そのまま採用
          {
            rank: 1,
            supporterId: 111,
            supporterName: 'A',
            contribution: 10,
            userPageUrl: 'https://www.nicovideo.jp/user/111'
          },
          // userPageUrl 無し → supporterId から組み立て
          { rank: 2, supporterId: 222, supporterName: 'B', contribution: 5 },
          // 匿名 → userPageUrl を付けない
          { rank: 3, supporterName: '名無し', contribution: 1 },
          // 想定外ホストの userPageUrl は捨て、supporterId 由来に倒す
          {
            rank: 4,
            supporterId: 444,
            supporterName: 'D',
            contribution: 2,
            userPageUrl: 'https://evil.example.com/user/444'
          }
        ]
      }
    });
    expect(rows[0].userPageUrl).toBe('https://www.nicovideo.jp/user/111');
    expect(rows[1].userPageUrl).toBe('https://www.nicovideo.jp/user/222');
    expect('userPageUrl' in rows[2]).toBe(false); // 匿名は付けない
    expect(rows[3].userPageUrl).toBe('https://www.nicovideo.jp/user/444'); // 不正ホスト→supporterId
  });
});

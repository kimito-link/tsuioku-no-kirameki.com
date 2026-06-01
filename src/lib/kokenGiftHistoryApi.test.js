import { describe, it, expect } from 'vitest';
import {
  KOKEN_GIFT_HISTORY_FETCH_MESSAGE_TYPE,
  GIFT_HISTORY_THROWS_STORAGE_PREFIX,
  giftHistoryThrowsStorageKey,
  buildKokenGiftHistoryUrl,
  isLikelyKokenGiftHistoryShape,
  normalizeKokenGiftHistoryResponse
} from './kokenGiftHistoryApi.js';

// 実機 lv350658954（2026-06-01）の /histories レスポンスを模した一次資料相当のサンプル。
const REAL_SHAPED = {
  meta: { status: 200 },
  data: {
    nextCount: 0,
    totalPoint: 700,
    showTimeBeginAt: 1780313433,
    histories: [
      {
        id: 259511471,
        supporterId: 1532216,
        supporterName: 'spspspspsp',
        supporterThumbnailUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg',
        itemName: 'わこちゅ',
        itemThumbnailUrl: 'https://ir.cdn.nimg.jp/res/nage/thumbnail/user125407984_2503_300_9.png',
        point: 300,
        contribution: 3000,
        publishedAt: 1780320114
      },
      {
        id: 259511472,
        supporterId: 1532216,
        supporterName: 'spspspspsp',
        supporterThumbnailUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg',
        itemName: 'はくしゅ',
        itemThumbnailUrl: 'https://ir.cdn.nimg.jp/res/nage/thumbnail/x.png',
        point: 100,
        contribution: 1000,
        publishedAt: 1780320200
      },
      {
        id: 259511480,
        supporterId: 690868,
        supporterName: 'ぴとなちゃん♡',
        supporterThumbnailUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/69/690868.jpg',
        itemName: 'ハート',
        itemThumbnailUrl: 'https://ir.cdn.nimg.jp/res/nage/thumbnail/y.png',
        point: 300,
        contribution: 3000,
        publishedAt: 1780320300
      }
    ]
  }
};

describe('buildKokenGiftHistoryUrl', () => {
  it('組み立てる（histories エンドポイント）', () => {
    expect(buildKokenGiftHistoryUrl('lv350658954')).toBe(
      'https://api.koken.nicovideo.jp/v1/userperspective/contents/gift/live/lv350658954/histories'
    );
  });
  it('不正 liveId は null（SSRF 面遮断）', () => {
    expect(buildKokenGiftHistoryUrl('')).toBeNull();
    expect(buildKokenGiftHistoryUrl('123')).toBeNull();
    expect(buildKokenGiftHistoryUrl('lvabc')).toBeNull();
    expect(buildKokenGiftHistoryUrl('lv1/../x')).toBeNull();
    expect(buildKokenGiftHistoryUrl(null)).toBeNull();
  });
});

describe('giftHistoryThrowsStorageKey', () => {
  it('既存 content inline と同一文字列', () => {
    expect(giftHistoryThrowsStorageKey('lv123')).toBe('nls_gift_history_throws_lv123');
    expect(giftHistoryThrowsStorageKey('LV123')).toBe('nls_gift_history_throws_lv123');
    expect(giftHistoryThrowsStorageKey('lv123')).toMatch(
      new RegExp('^' + GIFT_HISTORY_THROWS_STORAGE_PREFIX)
    );
  });
});

describe('isLikelyKokenGiftHistoryShape', () => {
  it('正常形は true', () => {
    expect(isLikelyKokenGiftHistoryShape(REAL_SHAPED)).toBe(true);
    expect(isLikelyKokenGiftHistoryShape({ data: { histories: [] } })).toBe(true);
  });
  it('meta.status!==200 / 非配列 / null は false', () => {
    expect(isLikelyKokenGiftHistoryShape({ meta: { status: 404 }, data: { histories: [] } })).toBe(false);
    expect(isLikelyKokenGiftHistoryShape({ data: { histories: 'x' } })).toBe(false);
    expect(isLikelyKokenGiftHistoryShape(null)).toBe(false);
    expect(isLikelyKokenGiftHistoryShape('x')).toBe(false);
  });
});

describe('normalizeKokenGiftHistoryResponse', () => {
  it('送り主ごとに throwCount + totalPoints を集計（記名は数値 uid キー＝リンク可能）', () => {
    const rows = normalizeKokenGiftHistoryResponse(REAL_SHAPED, { now: 1000 });
    expect(rows).not.toBeNull();
    expect(rows).toHaveLength(2);
    const sps = rows.find((r) => r.userId === '1532216');
    expect(sps).toBeTruthy();
    expect(sps.nickname).toBe('spspspspsp');
    expect(sps.throwCount).toBe(2);
    expect(sps.totalPoints).toBe(400); // 300 + 100
    expect(sps.capturedAt).toBe(1000);
    const pito = rows.find((r) => r.userId === '690868');
    expect(pito.throwCount).toBe(1);
    expect(pito.totalPoints).toBe(300);
    expect(pito.avatarUrl).toMatch(/^https:\/\//);
  });

  it('数値 uid キーはリンク可能（__anon_ 接頭辞を付けない）', () => {
    const rows = normalizeKokenGiftHistoryResponse(REAL_SHAPED, { now: 1 });
    for (const r of rows) {
      expect(r.userId).not.toMatch(/^__anon_/);
      expect(r.userId).toMatch(/^\d+$/);
    }
  });

  it('supporterId 欠落（匿名）は __anon_<senderName> キーに倒す', () => {
    const json = {
      meta: { status: 200 },
      data: {
        histories: [
          { supporterName: '名無し', point: 50, supporterThumbnailUrl: '' },
          { supporterName: '名無し', point: 70, supporterThumbnailUrl: '' }
        ]
      }
    };
    const rows = normalizeKokenGiftHistoryResponse(json, { now: 5 });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe('__anon_名無し');
    expect(rows[0].throwCount).toBe(2);
    expect(rows[0].totalPoints).toBe(120);
  });

  it('名前も uid も無い壊れ行は skip', () => {
    const json = {
      meta: { status: 200 },
      data: { histories: [{ supporterName: '   ', point: 100 }, { point: 50 }] }
    };
    expect(normalizeKokenGiftHistoryResponse(json, { now: 1 })).toBeNull();
  });

  it('不正形 / 空 histories は null（fail-soft）', () => {
    expect(normalizeKokenGiftHistoryResponse({ meta: { status: 404 } }, {})).toBeNull();
    expect(normalizeKokenGiftHistoryResponse({ data: { histories: [] } }, {})).toBeNull();
    expect(normalizeKokenGiftHistoryResponse(null, {})).toBeNull();
  });

  it('SW 側 message type 契約（リテラル同期）', () => {
    expect(KOKEN_GIFT_HISTORY_FETCH_MESSAGE_TYPE).toBe('NLS_KOKEN_GIFT_HISTORY_FETCH');
  });
});

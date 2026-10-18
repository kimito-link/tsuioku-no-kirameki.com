import { describe, it, expect } from 'vitest';
import {
  KOKEN_GIFT_HISTORY_FETCH_MESSAGE_TYPE,
  GIFT_HISTORY_THROWS_STORAGE_PREFIX,
  giftHistoryThrowsStorageKey,
  buildKokenGiftHistoryUrl,
  KOKEN_GIFT_HISTORY_LIMIT,
  isLikelyKokenGiftHistoryShape,
  formatKokenGiftStreamTimeLabel,
  buildGiftSubAppPayloadFromKokenJson,
  buildGiftSubAppPayloadFromDomRelay,
  buildKokenGiftPersistPayload,
  readKokenGiftHistoryNextCursor,
  mergeGiftSubAppHistoryPayload,
  aggregateGiftSubAppHistoryBySender,
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
      'https://api.koken.nicovideo.jp/v1/userperspective/contents/gift/live/lv350658954/histories?limit=100'
    );
  });
  it('nextCount cursor 付き URL', () => {
    expect(buildKokenGiftHistoryUrl('lv350658954', 60)).toContain('nextCount=60');
    expect(buildKokenGiftHistoryUrl('lv350658954', 60)).toContain('limit=100');
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

describe('formatKokenGiftStreamTimeLabel', () => {
  it('showTimeBeginAt からのオフセットを H:MM:SS にする', () => {
    const { timeLabel, sortKey } = formatKokenGiftStreamTimeLabel(1780320114, 1780313433);
    expect(timeLabel).toMatch(/^\d+:\d{2}:\d{2}$/);
    expect(sortKey).toBeGreaterThan(0);
  });
});

describe('buildKokenGiftPersistPayload', () => {
  it('複数ページを sub-app + throws にまとめる', () => {
    const { subApp, throws } = buildKokenGiftPersistPayload([REAL_SHAPED], null, {
      liveId: 'lv350658954'
    });
    expect(subApp?.history?.length).toBe(3);
    expect(throws?.length).toBe(2);
    const sps = throws?.find((t) => t.userId === '1532216');
    expect(sps?.throwCount).toBe(2);
    expect(sps?.totalPoints).toBe(400);
  });

  it('同一ページが重複しても throws を二重加算しない（kokenHistoryId dedup・回帰防止）', () => {
    // サーバが同じ nextCount を返し同一ページを 2 回取得したケースを再現。
    const single = buildKokenGiftPersistPayload([REAL_SHAPED], null, {
      liveId: 'lv350658954',
      now: 1000
    });
    const doubled = buildKokenGiftPersistPayload([REAL_SHAPED, REAL_SHAPED], null, {
      liveId: 'lv350658954',
      now: 1000
    });
    // history は kokenHistoryId で 1 件に畳まれる → 3 件のまま
    expect(doubled.subApp?.history?.length).toBe(3);
    // throws も件数・throwCount・totalPoints が single と完全一致（膨張しない）
    expect(doubled.throws?.length).toBe(single.throws?.length);
    const dSps = doubled.throws?.find((t) => t.userId === '1532216');
    expect(dSps?.throwCount).toBe(2); // 4 ではない
    expect(dSps?.totalPoints).toBe(400); // 800 ではない
  });
});

describe('buildGiftSubAppPayloadFromKokenJson', () => {
  it('個別履歴とアイテム別集計を返す', () => {
    const payload = buildGiftSubAppPayloadFromKokenJson(REAL_SHAPED, {
      now: 1000,
      liveId: 'lv350658954'
    });
    expect(payload).not.toBeNull();
    expect(payload.source).toBe('koken-api');
    expect(payload.history).toHaveLength(3);
    expect(payload.totalCounts.length).toBeGreaterThan(0);
    expect(payload.history[0].senderName).toBeTruthy();
    expect(payload.history[0].userId).toMatch(/^\d+$/);
  });
});

describe('aggregateGiftSubAppHistoryBySender', () => {
  it('history 行を送り主別 pt に集計する', () => {
    const payload = buildGiftSubAppPayloadFromKokenJson(REAL_SHAPED, {
      now: 1000,
      liveId: 'lv350658954'
    });
    const agg = aggregateGiftSubAppHistoryBySender(payload, { maxRooms: 10 });
    expect(agg).not.toBeNull();
    expect(agg?.rooms.length).toBeGreaterThan(0);
    expect(agg?.throwCount).toBe(3);
    expect(agg?.senderCount).toBeGreaterThanOrEqual(agg?.rooms.length);
    expect(agg?.senderCount).toBeLessThanOrEqual(agg?.throwCount);
    expect(agg?.pointsSumAll).toBe(agg?.pointsSumDisplayed);
    expect(agg?.rooms[0].count).toBeGreaterThan(0);
    expect(agg?.rooms[0].userKey).toMatch(/^\d+$/);
  });
});

describe('buildGiftSubAppPayloadFromDomRelay', () => {
  it('iframe リレー行を sub-app payload にする', () => {
    const payload = buildGiftSubAppPayloadFromDomRelay(
      [
        {
          itemName: 'お祭り提灯ガチャ子',
          senderName: '名無し',
          points: 10,
          time: '0:51:39'
        }
      ],
      [{ itemName: 'お祭り提灯ガチャ子', count: 62 }],
      { liveId: 'lv1' }
    );
    expect(payload?.source).toBe('dom-scrape');
    expect(payload?.history).toHaveLength(1);
    expect(payload?.totalCounts[0].count).toBe(62);
  });
});

describe('readKokenGiftHistoryNextCursor', () => {
  it('nextCount>0 なら cursor を返す', () => {
    expect(readKokenGiftHistoryNextCursor({ ...REAL_SHAPED, data: { ...REAL_SHAPED.data, nextCount: 60 } })).toBe(60);
    expect(readKokenGiftHistoryNextCursor(REAL_SHAPED)).toBeNull();
  });
});

describe('mergeGiftSubAppHistoryPayload', () => {
  it('koken のみならそのまま', () => {
    const koken = buildGiftSubAppPayloadFromKokenJson(REAL_SHAPED, { now: 1 });
    const merged = mergeGiftSubAppHistoryPayload(null, koken);
    expect(merged?.history).toHaveLength(3);
  });

  it('部分スキャンでも既存 koken 行を保持する', () => {
    const koken = buildGiftSubAppPayloadFromKokenJson(REAL_SHAPED, { now: 1 });
    const partialDom = {
      source: 'dom-scrape',
      history: [{ itemName: '新規', senderName: 'domUser', points: 10, time: '0:99:00' }],
      totalCounts: []
    };
    const merged = mergeGiftSubAppHistoryPayload(koken, partialDom);
    expect(merged?.history.length).toBe(4);
  });

  it('DOM と koken をユニオン', () => {
    const dom = {
      source: 'dom-scrape',
      history: [
        { itemName: 'わこちゅ', senderName: 'domUser', points: 300, time: '0:10:00' }
      ],
      totalCounts: [{ itemName: 'わこちゅ', count: 1 }]
    };
    const koken = buildGiftSubAppPayloadFromKokenJson(REAL_SHAPED, { now: 1 });
    const merged = mergeGiftSubAppHistoryPayload(dom, koken);
    expect(merged?.history.length).toBeGreaterThan(3);
    expect(merged?.source).toBe('merged');
  });
});


describe('履歴の公開時刻(v0.1.1663)', () => {
  it('★保存する行に公式の公開時刻(epoch秒)を持たせる(時計の時刻で「いつ投げたか」を出すため)', () => {
    const json = { meta: { status: 200 }, data: { showTimeBeginAt: 1780319000, histories: [
      { id: 1, supporterId: 10, supporterName: 'a', itemName: 'x', point: 10, publishedAt: 1780320114 },
      { id: 2, supporterId: 11, supporterName: 'b', itemName: 'y', point: 20 }
    ] } };
    const p = buildGiftSubAppPayloadFromKokenJson(json, { now: 1, liveId: 'lv1' });
    const byId = Object.fromEntries(p.history.map((h) => [h.kokenHistoryId, h]));
    expect(byId['1'].publishedAt).toBe(1780320114);
    expect(byId['2'].publishedAt).toBe(0);
  });
  it('★古い保存(時刻なし)と新しい取得(時刻あり)が重なったら、時刻のある行を残す', () => {
    const old = { liveId: 'lv1', capturedAt: 1, source: 'koken-api', totalCounts: [], history: [
      { kokenHistoryId: '1', userId: '10', senderName: 'a', itemName: 'x', points: 10, time: '0:01:00', sortKey: 60 }
    ] };
    const neu = { liveId: 'lv1', capturedAt: 2, source: 'koken-api', totalCounts: [], history: [
      { kokenHistoryId: '1', userId: '10', senderName: 'a', itemName: 'x', points: 10, time: '0:01:00', sortKey: 60, publishedAt: 1780320114 }
    ] };
    const m = mergeGiftSubAppHistoryPayload(old, neu);
    expect(m.history).toHaveLength(1);
    expect(m.history[0].publishedAt).toBe(1780320114);
  });
});

describe('履歴は limit=100 で1回で全件取る(v0.1.1669・実測: 既定10件・limit=100で80件全部・明細合計=公式totalPoint)', () => {
  it('★取得件数の定数は公式の上限100以下(200以上は HTTP 400)', () => {
    expect(KOKEN_GIFT_HISTORY_LIMIT).toBe(100);
  });
  it('★SW(background.js・ESM import 不可)が lib と同じ件数を指定している(手で書き写した値のずれを赤くする)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../extension/background.js', import.meta.url), 'utf8');
    const m = /const KOKEN_GIFT_HISTORY_LIMIT = (\d+);/.exec(src);
    expect(m, 'background.js に KOKEN_GIFT_HISTORY_LIMIT が見つからない').toBeTruthy();
    expect(Number(m[1])).toBe(KOKEN_GIFT_HISTORY_LIMIT);
    expect(src).toContain("?limit=' + KOKEN_GIFT_HISTORY_LIMIT");
  });
  it('★公式の合計ptと残り件数を保存する(明細の合計と照合するため・additive)', () => {
    const json = { meta: { status: 200 }, data: { totalPoint: 3980, nextCount: 0, showTimeBeginAt: 1780319000, histories: [
      { id: 1, supporterId: 10, supporterName: 'a', itemName: 'x', point: 3000, publishedAt: 1780320114 },
      { id: 2, supporterName: '名無し', itemName: 'y', point: 980, publishedAt: 1780320200 }
    ] } };
    const p = buildGiftSubAppPayloadFromKokenJson(json, { now: 1, liveId: 'lv1' });
    expect(p.officialTotalPoint).toBe(3980);
    expect(p.officialRemaining).toBe(0);
  });
  it('★重ねて保存しても、最新の取得の公式合計・残り件数が残る', () => {
    const old = { liveId: 'lv1', capturedAt: 1, source: 'koken-api', totalCounts: [], officialTotalPoint: 100, officialRemaining: 0, history: [
      { kokenHistoryId: '1', userId: '10', senderName: 'a', itemName: 'x', points: 100, time: '0:01:00', sortKey: 60, publishedAt: 1780320114 } ] };
    const neu = { liveId: 'lv1', capturedAt: 2, source: 'koken-api', totalCounts: [], officialTotalPoint: 400, officialRemaining: 0, history: [
      { kokenHistoryId: '1', userId: '10', senderName: 'a', itemName: 'x', points: 100, time: '0:01:00', sortKey: 60, publishedAt: 1780320114 },
      { kokenHistoryId: '2', userId: '11', senderName: 'b', itemName: 'y', points: 300, time: '0:02:00', sortKey: 120, publishedAt: 1780320200 } ] };
    const m = mergeGiftSubAppHistoryPayload(old, neu);
    expect(m.officialTotalPoint).toBe(400);
    expect(m.officialRemaining).toBe(0);
    expect(m.history).toHaveLength(2);
  });
});

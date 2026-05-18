import { describe, it, expect } from 'vitest';
import {
  extractStatisticsFromWsJson,
  extractStatisticsFromParsedObject,
  projectStatisticsAudienceSignal
} from './wsStatisticsExtract.js';

describe('extractStatisticsFromParsedObject', () => {
  it('標準的な statistics メッセージから viewers を取得', () => {
    const obj = { type: 'statistics', data: { viewers: 41, comments: 1 } };
    const r = extractStatisticsFromParsedObject(obj);
    expect(r).toEqual({ viewers: 41, comments: 1 });
  });

  it('viewers が 0 でも有効', () => {
    const obj = { type: 'statistics', data: { viewers: 0, comments: 0 } };
    const r = extractStatisticsFromParsedObject(obj);
    expect(r).toEqual({ viewers: 0, comments: 0 });
  });

  it('大きな視聴者数', () => {
    const obj = { type: 'statistics', data: { viewers: 125000, comments: 9800 } };
    const r = extractStatisticsFromParsedObject(obj);
    expect(r).toEqual({ viewers: 125000, comments: 9800 });
  });

  it('data に adWatchers 等の追加フィールドがあっても viewers を取得', () => {
    const obj = {
      type: 'statistics',
      data: { viewers: 300, comments: 55, adWatchers: 12 }
    };
    const r = extractStatisticsFromParsedObject(obj);
    expect(r).toEqual({ viewers: 300, comments: 55 });
  });

  it('comments フィールドが無くても viewers だけ取得', () => {
    const obj = { type: 'statistics', data: { viewers: 77 } };
    const r = extractStatisticsFromParsedObject(obj);
    expect(r).toEqual({ viewers: 77, comments: null });
  });

  it('watchCount キーからも viewers を取得', () => {
    const obj = { type: 'statistics', data: { watchCount: 1806, commentCount: 414 } };
    const r = extractStatisticsFromParsedObject(obj);
    expect(r).toEqual({ viewers: 1806, comments: 414 });
  });

  it('type なしでも data に watchCount があれば取得', () => {
    const obj = { data: { watchCount: 500 } };
    const r = extractStatisticsFromParsedObject(obj);
    expect(r).toEqual({ viewers: 500, comments: null });
  });

  it('トップレベルに viewers がある場合も取得', () => {
    const obj = { viewers: 200, comments: 30 };
    const r = extractStatisticsFromParsedObject(obj);
    expect(r).toEqual({ viewers: 200, comments: 30 });
  });

  it('viewerCount/viewCount 等の変形キーにも対応', () => {
    expect(extractStatisticsFromParsedObject({ data: { viewerCount: 99 } }))
      .toEqual({ viewers: 99, comments: null });
    expect(extractStatisticsFromParsedObject({ data: { viewCount: 88 } }))
      .toEqual({ viewers: 88, comments: null });
  });

  it('ビューア数キーが一切なければ null', () => {
    expect(extractStatisticsFromParsedObject({ type: 'ping' })).toBeNull();
    expect(extractStatisticsFromParsedObject({ type: 'stream', data: {} })).toBeNull();
  });

  it('data が無く viewers もトップレベルに無ければ null', () => {
    expect(extractStatisticsFromParsedObject({ type: 'statistics' })).toBeNull();
    expect(
      extractStatisticsFromParsedObject({ type: 'statistics', data: {} })
    ).toBeNull();
    expect(
      extractStatisticsFromParsedObject({ type: 'statistics', data: { onlyComments: 5 } })
    ).toBeNull();
  });

  it('viewers が無くても gift_points / ad_points があれば抽出', () => {
    expect(
      extractStatisticsFromParsedObject({
        type: 'statistics',
        data: { gift_points: 2045, ad_points: 19900 }
      })
    ).toEqual({ giftPoints: 2045, adPoints: 19900 });
  });

  it('viewers と gift_points を同時に返す', () => {
    const obj = {
      type: 'statistics',
      data: { watchCount: 100, giftPoints: 50, ad_points: 10 }
    };
    expect(extractStatisticsFromParsedObject(obj)).toEqual({
      viewers: 100,
      comments: null,
      giftPoints: 50,
      adPoints: 10
    });
  });

  it('viewers が文字列数値でも parseInt して取得', () => {
    const obj = { type: 'statistics', data: { viewers: '1234', comments: '56' } };
    const r = extractStatisticsFromParsedObject(obj);
    expect(r).toEqual({ viewers: 1234, comments: 56 });
  });

  it('viewers が負数のときは無効（他フィールドも無ければ null）', () => {
    expect(
      extractStatisticsFromParsedObject({ type: 'statistics', data: { viewers: -1 } })
    ).toBeNull();
  });

  it('非オブジェクト入力は null', () => {
    expect(extractStatisticsFromParsedObject(null)).toBeNull();
    expect(extractStatisticsFromParsedObject(42)).toBeNull();
    expect(extractStatisticsFromParsedObject('hello')).toBeNull();
    expect(extractStatisticsFromParsedObject(undefined)).toBeNull();
  });
});

describe('projectStatisticsAudienceSignal (F4 ingress 契約)', () => {
  it('statistics/viewers は累計来場として返し、同接候補は返さない', () => {
    expect(
      projectStatisticsAudienceSignal({ viewers: 54321, comments: 12 })
    ).toMatchObject({
      cumulativeVisitors: 54321,
      comments: 12,
      concurrentCandidate: null
    });
  });

  it('watchCount キーも累計来場であり concurrentCandidate は常に null', () => {
    expect(
      projectStatisticsAudienceSignal({ watchCount: 54321 })
    ).toMatchObject({ cumulativeVisitors: 54321, concurrentCandidate: null });
  });

  it('type:"statistics" + data ラップでも累計来場として射影', () => {
    expect(
      projectStatisticsAudienceSignal({
        type: 'statistics',
        data: { watchCount: 1806, commentCount: 414 }
      })
    ).toEqual({
      cumulativeVisitors: 1806,
      comments: 414,
      concurrentCandidate: null
    });
  });

  it('F4 退行ガード: どれだけ大きな来場値でも concurrentCandidate に昇格しない', () => {
    // 累計来場が巨大でも「同接候補」には決して載せない（過大表示の根本原因）。
    const r = projectStatisticsAudienceSignal({ viewers: 9_999_999 });
    expect(r.concurrentCandidate).toBeNull();
    expect(r.cumulativeVisitors).toBe(9_999_999);
  });

  it('viewer 系キーが無ければ cumulativeVisitors は null（同接は推定 fallback に委ねる）', () => {
    expect(
      projectStatisticsAudienceSignal({ type: 'statistics', data: {} })
    ).toEqual({
      cumulativeVisitors: null,
      comments: null,
      concurrentCandidate: null
    });
    expect(
      projectStatisticsAudienceSignal({ data: { giftPoints: 50 } })
    ).toMatchObject({ cumulativeVisitors: null, concurrentCandidate: null });
  });

  it('非オブジェクト入力でも壊れず concurrentCandidate:null を返す', () => {
    for (const bad of [null, undefined, 42, 'x', [1, 2]]) {
      expect(projectStatisticsAudienceSignal(bad)).toEqual({
        cumulativeVisitors: null,
        comments: null,
        concurrentCandidate: null
      });
    }
  });
});

describe('extractStatisticsFromWsJson', () => {
  it('JSON 文字列をパースして statistics を返す', () => {
    const json = '{"type":"statistics","data":{"viewers":41,"comments":1}}';
    const r = extractStatisticsFromWsJson(json);
    expect(r).toEqual({ viewers: 41, comments: 1 });
  });

  it('statistics 以外の JSON は null', () => {
    expect(extractStatisticsFromWsJson('{"type":"ping"}')).toBeNull();
  });

  it('不正な JSON は null', () => {
    expect(extractStatisticsFromWsJson('not json')).toBeNull();
    expect(extractStatisticsFromWsJson('')).toBeNull();
  });

  it('配列 JSON は null', () => {
    expect(extractStatisticsFromWsJson('[1,2,3]')).toBeNull();
  });
});

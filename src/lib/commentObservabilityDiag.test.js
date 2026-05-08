import { describe, it, expect } from 'vitest';
import { Window } from 'happy-dom';
import {
  probeCommentRowDataAttributes,
  analyzeNdgrChatRejection,
  aggregateSavedCommentsUidStats,
  parseInterceptFetchLog,
  snapshotCommentIngestCounters
} from './commentObservabilityDiag.js';

function makeRow(window, attrs) {
  const el = window.document.createElement('div');
  for (const [k, v] of Object.entries(attrs || {})) {
    el.setAttribute(k, String(v));
  }
  return el;
}

describe('probeCommentRowDataAttributes', () => {
  it('uid 系属性が無い row は rowsWithoutUserIdLikeAttr に計上', () => {
    const w = new Window();
    const rows = [
      makeRow(w, { class: '___table-row___xxx', 'data-comment-no': '1' }),
      makeRow(w, { class: '___table-row___xxx', 'data-comment-no': '2' })
    ];
    const r = probeCommentRowDataAttributes(rows);
    expect(r.sampledRows).toBe(2);
    expect(r.rowsWithUserIdLikeAttr).toBe(0);
    expect(r.rowsWithoutUserIdLikeAttr).toBe(2);
    expect(r.userIdLikeAttributesFound).toEqual([]);
  });

  it('data-user-id がある row は計上され、attribute key に記録', () => {
    const w = new Window();
    const rows = [
      makeRow(w, { class: 'r', 'data-user-id': '12345' }),
      makeRow(w, { class: 'r', 'data-comment-no': '2' })
    ];
    const r = probeCommentRowDataAttributes(rows);
    expect(r.rowsWithUserIdLikeAttr).toBe(1);
    expect(r.rowsWithoutUserIdLikeAttr).toBe(1);
    expect(r.userIdLikeAttributesFound).toContain('data-user-id');
  });

  it('複数の uid 系属性候補（data-userid / data-owner-id 等）も検出', () => {
    const w = new Window();
    const rows = [makeRow(w, { 'data-owner-id': 'X' })];
    const r = probeCommentRowDataAttributes(rows);
    expect(r.rowsWithUserIdLikeAttr).toBe(1);
    expect(r.userIdLikeAttributesFound).toContain('data-owner-id');
  });

  it('limit option で sampling 件数を制限', () => {
    const w = new Window();
    const rows = Array.from({ length: 20 }, () => makeRow(w, {}));
    const r = probeCommentRowDataAttributes(rows, { limit: 3 });
    expect(r.sampledRows).toBe(3);
  });

  it('null / 不正入力は安全に空集計を返す', () => {
    expect(probeCommentRowDataAttributes(null).sampledRows).toBe(0);
    expect(probeCommentRowDataAttributes(undefined).sampledRows).toBe(0);
    expect(probeCommentRowDataAttributes([]).sampledRows).toBe(0);
  });

  it('attributeKeysSample に各 row の attribute name 配列を含む', () => {
    const w = new Window();
    const rows = [makeRow(w, { class: 'r', 'data-comment-no': '1' })];
    const r = probeCommentRowDataAttributes(rows);
    expect(r.attributeKeysSample).toHaveLength(1);
    expect(r.attributeKeysSample[0]).toContain('class');
    expect(r.attributeKeysSample[0]).toContain('data-comment-no');
  });
});

describe('analyzeNdgrChatRejection', () => {
  it('chat.no が null/undefined は noNumberSkip', () => {
    const r = analyzeNdgrChatRejection([
      { no: null, content: 'a' },
      { no: undefined, content: 'b' },
      { content: 'c' }
    ]);
    expect(r.noNumberSkip).toBe(3);
    expect(r.accepted).toBe(0);
    expect(r.totalInput).toBe(3);
  });

  it('content が空は emptyTextSkip', () => {
    const r = analyzeNdgrChatRejection([
      { no: 1, content: '' },
      { no: 2, content: '   ' }
    ]);
    expect(r.emptyTextSkip).toBe(2);
    expect(r.accepted).toBe(0);
  });

  it('parseGiftCommentText に該当する行は giftSystemMsgSkip', () => {
    const r = analyzeNdgrChatRejection([
      { no: 1, content: 'シンラツさんがギフト「応援メガホン 黄（10pt）」を贈りました' }
    ]);
    expect(r.giftSystemMsgSkip).toBe(1);
    expect(r.accepted).toBe(0);
  });

  it('通常コメは accepted', () => {
    const r = analyzeNdgrChatRejection([
      { no: 1, content: 'こんにちは' },
      { no: 2, content: '888' }
    ]);
    expect(r.accepted).toBe(2);
  });

  it('複合: 4 種類の reason を同時集計', () => {
    const r = analyzeNdgrChatRejection([
      { no: null, content: 'a' },
      { no: 1, content: '' },
      { no: 2, content: 'シンラツさんがギフト「メガホン（10pt）」を贈りました' },
      { no: 3, content: '通常コメ' }
    ]);
    expect(r).toEqual({
      totalInput: 4,
      noNumberSkip: 1,
      emptyTextSkip: 1,
      giftSystemMsgSkip: 1,
      accepted: 1
    });
  });

  it('null / 不正入力は空集計', () => {
    expect(analyzeNdgrChatRejection(null).totalInput).toBe(0);
    expect(analyzeNdgrChatRejection(undefined).totalInput).toBe(0);
  });
});

describe('aggregateSavedCommentsUidStats', () => {
  it('userId が空の entry は withoutUid に計上', () => {
    const r = aggregateSavedCommentsUidStats([
      { userId: '12345' },
      { userId: '' },
      { userId: null },
      {}
    ]);
    expect(r.totalSaved).toBe(4);
    expect(r.withUid).toBe(1);
    expect(r.withoutUid).toBe(3);
    expect(r.withUidPercent).toBe(25);
  });

  it('全件 uid あり → 100%', () => {
    const r = aggregateSavedCommentsUidStats([{ userId: '1' }, { userId: '2' }]);
    expect(r.withUidPercent).toBe(100);
  });

  it('空配列 → 0%', () => {
    const r = aggregateSavedCommentsUidStats([]);
    expect(r.totalSaved).toBe(0);
    expect(r.withUidPercent).toBe(0);
  });

  it('小数第 1 位まで丸め', () => {
    const r = aggregateSavedCommentsUidStats([
      { userId: '1' },
      { userId: '' },
      { userId: '' }
    ]);
    expect(r.withUidPercent).toBe(33.3);
  });
});

describe('parseInterceptFetchLog', () => {
  it('" | " 区切りで分割', () => {
    const r = parseInterceptFetchLog('/api/a [json] | /api/b [octet]');
    expect(r).toEqual(['/api/a [json]', '/api/b [octet]']);
  });

  it('空文字 / null は空配列', () => {
    expect(parseInterceptFetchLog('')).toEqual([]);
    expect(parseInterceptFetchLog(null)).toEqual([]);
    expect(parseInterceptFetchLog(undefined)).toEqual([]);
  });

  it('空セグメントは除外', () => {
    expect(parseInterceptFetchLog('/a |  | /b')).toEqual(['/a', '/b']);
  });
});

describe('snapshotCommentIngestCounters', () => {
  it('数値 counter のみ抽出', () => {
    const r = snapshotCommentIngestCounters({
      NDGR: 3,
      MUTATION: 150,
      DEEP: 0,
      VISIBLE: 0
    });
    expect(r).toEqual({ NDGR: 3, MUTATION: 150, DEEP: 0, VISIBLE: 0 });
  });

  it('負数や NaN は 0 に', () => {
    const r = snapshotCommentIngestCounters({ a: -1, b: NaN, c: Infinity, d: 5 });
    expect(r).toEqual({ a: 0, b: 0, c: 0, d: 5 });
  });

  it('null / 不正入力は空オブジェクト', () => {
    expect(snapshotCommentIngestCounters(null)).toEqual({});
    expect(snapshotCommentIngestCounters(undefined)).toEqual({});
  });
});

/**
 * parseArrivalCommentText のテスト。
 *
 * 2026-07-06: ニコ生「来場」システムメッセージ4形式のパース+誤検知ゼロの確認。
 */

import { describe, it, expect } from 'vitest';
import { parseArrivalCommentText } from './parseArrivalComment.js';

describe('parseArrivalCommentText', () => {
  it('形式1: 放送者の好み(interest)をパースできる', () => {
    expect(
      parseArrivalCommentText('放送者の好み「真夏の夜の淫夢」に興味のある1人が来場しました')
    ).toEqual({
      entries: [{ keyword: '真夏の夜の淫夢', count: 1, source: 'interest' }],
      totalCount: 1
    });
  });

  it('形式2: 大百科記事(dictionary・単一)をパースできる', () => {
    expect(
      parseArrivalCommentText('大百科記事「真夏の夜の淫夢」から1人が来場しました')
    ).toEqual({
      entries: [{ keyword: '真夏の夜の淫夢', count: 1, source: 'dictionary' }],
      totalCount: 1
    });
  });

  it('形式3: 好き(like・単一)をパースできる', () => {
    expect(
      parseArrivalCommentText('「ニコニコ生放送」が好きな2人が来場しました')
    ).toEqual({
      entries: [{ keyword: 'ニコニコ生放送', count: 2, source: 'like' }],
      totalCount: 2
    });
  });

  it('形式3: 好き(like・複数)をパースできる', () => {
    expect(
      parseArrivalCommentText('「ニコニコ生放送」が好きな2人、「真夏の夜の淫夢」が好きな1人が来場しました')
    ).toEqual({
      entries: [
        { keyword: 'ニコニコ生放送', count: 2, source: 'like' },
        { keyword: '真夏の夜の淫夢', count: 1, source: 'like' }
      ],
      totalCount: 3
    });
  });

  it('形式4: 大百科記事(dictionary・複数)をパースできる', () => {
    expect(
      parseArrivalCommentText('大百科記事「おっぱい」から1人、「百合」から1人が来場しました')
    ).toEqual({
      entries: [
        { keyword: 'おっぱい', count: 1, source: 'dictionary' },
        { keyword: '百合', count: 1, source: 'dictionary' }
      ],
      totalCount: 2
    });
  });

  it('大百科記事3件以上のカンマ区切りもパースできる', () => {
    expect(
      parseArrivalCommentText('大百科記事「A」から1人、「B」から2人、「C」から3人が来場しました')
    ).toEqual({
      entries: [
        { keyword: 'A', count: 1, source: 'dictionary' },
        { keyword: 'B', count: 2, source: 'dictionary' },
        { keyword: 'C', count: 3, source: 'dictionary' }
      ],
      totalCount: 6
    });
  });

  it('鉤括弧『』でもパースできる', () => {
    expect(
      parseArrivalCommentText('大百科記事『真夏の夜の淫夢』から1人が来場しました')
    ).toEqual({
      entries: [{ keyword: '真夏の夜の淫夢', count: 1, source: 'dictionary' }],
      totalCount: 1
    });
  });

  it('2桁以上の人数もパースできる', () => {
    expect(
      parseArrivalCommentText('放送者の好み「テスト」に興味のある12人が来場しました')
    ).toEqual({
      entries: [{ keyword: 'テスト', count: 12, source: 'interest' }],
      totalCount: 12
    });
  });

  it('通常のコメントは null', () => {
    expect(parseArrivalCommentText('こんにちは〜')).toBeNull();
  });

  it('ギフトコメントは null(誤検知しない)', () => {
    expect(
      parseArrivalCommentText('シンラツさんがギフト「応援メガホン 黄（10pt）」を贈りました')
    ).toBeNull();
  });

  it('ニコニ広告コメントは null(誤検知しない)', () => {
    expect(
      parseArrivalCommentText('【ニコニ広告】君はりんく＠クリエイター応援さんが100pt広告しました')
    ).toBeNull();
  });

  it('空文字は null', () => {
    expect(parseArrivalCommentText('')).toBeNull();
    expect(parseArrivalCommentText('   ')).toBeNull();
  });

  it('文字列以外は null', () => {
    expect(parseArrivalCommentText(null)).toBeNull();
    expect(parseArrivalCommentText(undefined)).toBeNull();
    expect(parseArrivalCommentText(123)).toBeNull();
  });

  it('末尾が「来場しました」でなければ null', () => {
    expect(parseArrivalCommentText('大百科記事「真夏の夜の淫夢」から1人が退出しました')).toBeNull();
  });

  it('人数が0人は null(不正値として棄却)', () => {
    expect(parseArrivalCommentText('大百科記事「テスト」から0人が来場しました')).toBeNull();
  });

  it('鉤括弧の中身が空は null', () => {
    expect(parseArrivalCommentText('大百科記事「」から1人が来場しました')).toBeNull();
  });

  it('複数要素の一部が崩れていれば全体を棄却する(誤検知ゼロ優先)', () => {
    expect(
      parseArrivalCommentText('大百科記事「おっぱい」から1人、変な文言が来場しました')
    ).toBeNull();
  });

  it('似ているが違う文言(来場でなく視聴)は null', () => {
    expect(parseArrivalCommentText('大百科記事「テスト」から1人が視聴しました')).toBeNull();
  });
});

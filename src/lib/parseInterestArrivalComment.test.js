import { describe, it, expect } from 'vitest';
import {
  parseInterestArrivalComment,
  isInterestArrivalCommentText
} from './parseInterestArrivalComment.js';

describe('parseInterestArrivalComment', () => {
  it('「料理」が好きな1人が来場しました', () => {
    expect(parseInterestArrivalComment('「料理」が好きな1人が来場しました')).toEqual({
      tag: '料理',
      count: 1
    });
  });

  it('「雑談」が好きな1人が来場しました', () => {
    expect(parseInterestArrivalComment('「雑談」が好きな1人が来場しました')).toEqual({
      tag: '雑談',
      count: 1
    });
  });

  it('複数人来場', () => {
    expect(parseInterestArrivalComment('「ゲーム」が好きな3人が来場しました')).toEqual({
      tag: 'ゲーム',
      count: 3
    });
  });

  it('前後空白は trim', () => {
    expect(parseInterestArrivalComment('  「料理」が好きな1人が来場しました  ')).toEqual({
      tag: '料理',
      count: 1
    });
  });

  it('通常コメント・ギフト文は null', () => {
    expect(parseInterestArrivalComment('普通のコメント')).toBe(null);
    expect(
      parseInterestArrivalComment('シンラツさんがギフト「応援メガホン 黄（10pt）」を贈りました')
    ).toBe(null);
    expect(parseInterestArrivalComment('')).toBe(null);
    expect(parseInterestArrivalComment(null)).toBe(null);
    expect(parseInterestArrivalComment(undefined)).toBe(null);
  });

  it('表記ゆれ（末尾・人数0）は null', () => {
    expect(parseInterestArrivalComment('「料理」が好きな0人が来場しました')).toBe(null);
    expect(parseInterestArrivalComment('料理好きが来場しました')).toBe(null);
    expect(parseInterestArrivalComment('「料理」が好きな1人が来場しました！')).toBe(null);
  });
});

describe('isInterestArrivalCommentText', () => {
  it('パース成功時 true', () => {
    expect(isInterestArrivalCommentText('「料理」が好きな1人が来場しました')).toBe(true);
  });

  it('通常コメントは false', () => {
    expect(isInterestArrivalCommentText('hello')).toBe(false);
  });
});

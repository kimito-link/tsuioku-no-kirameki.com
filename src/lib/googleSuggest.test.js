import { describe, it, expect } from 'vitest';
import {
  GOOGLE_SUGGEST_FETCH_MESSAGE_TYPE,
  GOOGLE_SUGGEST_MAX_QUERY_LEN,
  isValidSuggestQuery,
  buildGoogleSuggestUrl,
  parseGoogleSuggestResponse
} from './googleSuggest.js';

describe('isValidSuggestQuery', () => {
  it('1〜100文字の文字列は妥当', () => {
    expect(isValidSuggestQuery('配信者名')).toBe(true);
    expect(isValidSuggestQuery('a')).toBe(true);
    expect(isValidSuggestQuery('あ'.repeat(GOOGLE_SUGGEST_MAX_QUERY_LEN))).toBe(true);
  });
  it('空 / 空白のみ / 長すぎ / 非文字列は不正', () => {
    expect(isValidSuggestQuery('')).toBe(false);
    expect(isValidSuggestQuery('   ')).toBe(false);
    expect(isValidSuggestQuery('あ'.repeat(GOOGLE_SUGGEST_MAX_QUERY_LEN + 1))).toBe(false);
    expect(isValidSuggestQuery(null)).toBe(false);
    expect(isValidSuggestQuery(123)).toBe(false);
    expect(isValidSuggestQuery(undefined)).toBe(false);
  });
});

describe('buildGoogleSuggestUrl', () => {
  it('固定 host/path + エンコード済みクエリ', () => {
    const url = buildGoogleSuggestUrl('テスト');
    expect(url.startsWith('https://suggestqueries.google.com/complete/search?')).toBe(true);
    expect(url).toContain('client=firefox');
    expect(url).toContain('hl=ja');
    expect(url).toContain('q=' + encodeURIComponent('テスト'));
  });
  it('URL に差し込めない文字をエンコードする (SSRF面遮断)', () => {
    const url = buildGoogleSuggestUrl('a&b=c #x');
    expect(url).not.toContain('a&b=c #x');
    expect(url).toContain(encodeURIComponent('a&b=c #x'));
  });
  it('前後空白を trim する', () => {
    expect(buildGoogleSuggestUrl('  foo  ')).toContain('q=foo');
  });
  it('null/undefined でも壊れない', () => {
    expect(() => buildGoogleSuggestUrl(null)).not.toThrow();
    expect(() => buildGoogleSuggestUrl(undefined)).not.toThrow();
  });
});

describe('parseGoogleSuggestResponse', () => {
  it('client=firefox 形式 [query,[cand,...]] の data[1] を返す', () => {
    const data = ['配信者', ['配信者 詐欺', '配信者 評判', '配信者 歌枠']];
    expect(parseGoogleSuggestResponse(data)).toEqual([
      '配信者 詐欺',
      '配信者 評判',
      '配信者 歌枠'
    ]);
  });
  it('候補が無い / 空でも安全に空配列', () => {
    expect(parseGoogleSuggestResponse(['q', []])).toEqual([]);
    expect(parseGoogleSuggestResponse(['q'])).toEqual([]);
  });
  it('非文字列の候補は除外する', () => {
    expect(parseGoogleSuggestResponse(['q', ['ok', null, 42, '', 'good']])).toEqual([
      'ok',
      'good'
    ]);
  });
  it('不正な入力は空配列', () => {
    expect(parseGoogleSuggestResponse(null)).toEqual([]);
    expect(parseGoogleSuggestResponse({})).toEqual([]);
    expect(parseGoogleSuggestResponse('foo')).toEqual([]);
    expect(parseGoogleSuggestResponse([])).toEqual([]);
  });
});

describe('message type 定数', () => {
  it('background.js と同期する固定文字列', () => {
    expect(GOOGLE_SUGGEST_FETCH_MESSAGE_TYPE).toBe('NLS_GOOGLE_SUGGEST_FETCH');
  });
});

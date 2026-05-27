import { describe, it, expect } from 'vitest';
import {
  pickPrunableStorageKeys,
  PRUNABLE_STORAGE_KEY_PREFIXES
} from './prunableStorageKeys.js';

describe('pickPrunableStorageKeys', () => {
  it('prune 対象 prefix のキーだけ返し、巨大コメント配列キーは除外する', () => {
    const allKeys = [
      'nls_comments_lv123', // ← 巨大配列。除外されるべき（これが get(null) の重さの主因）
      'nls_event_dom_lv123',
      'nls_koken_api_contrib_lv123',
      'nls_nicoad_api_ranking_lv123',
      'nls_event_participation_lv123',
      'nls_event_score_ranking_lv123',
      'nls_nicoad_ranking_lv123',
      'nls_recording_enabled', // 関係ない設定キー
      'nls_user_comment_profile_cache' // 関係ないキャッシュ
    ];
    const got = pickPrunableStorageKeys(allKeys);
    expect(got).toEqual([
      'nls_event_dom_lv123',
      'nls_koken_api_contrib_lv123',
      'nls_nicoad_api_ranking_lv123',
      'nls_event_participation_lv123',
      'nls_event_score_ranking_lv123',
      'nls_nicoad_ranking_lv123'
    ]);
    expect(got).not.toContain('nls_comments_lv123');
  });

  it('入力順を保ち、重複は除く', () => {
    const got = pickPrunableStorageKeys([
      'nls_event_dom_b',
      'nls_event_dom_a',
      'nls_event_dom_b' // 重複
    ]);
    expect(got).toEqual(['nls_event_dom_b', 'nls_event_dom_a']);
  });

  it('Set など Iterable でも動く', () => {
    const got = pickPrunableStorageKeys(
      new Set(['nls_comments_lvX', 'nls_koken_api_contrib_lvX'])
    );
    expect(got).toEqual(['nls_koken_api_contrib_lvX']);
  });

  it('空 / null / undefined は空配列', () => {
    expect(pickPrunableStorageKeys([])).toEqual([]);
    expect(pickPrunableStorageKeys(null)).toEqual([]);
    expect(pickPrunableStorageKeys(undefined)).toEqual([]);
  });

  it('prefix を明示指定できる', () => {
    const got = pickPrunableStorageKeys(
      ['nls_event_dom_a', 'nls_koken_api_contrib_a'],
      ['nls_event_dom_']
    );
    expect(got).toEqual(['nls_event_dom_a']);
  });

  it('nls_nicoad_ranking_ と nls_nicoad_api_ranking_ は別物として両方拾う', () => {
    // 紛らわしい prefix（api 有無）。どちらも prune 対象なので両方拾われる。
    const got = pickPrunableStorageKeys([
      'nls_nicoad_ranking_lv1',
      'nls_nicoad_api_ranking_lv1'
    ]);
    expect(got).toContain('nls_nicoad_ranking_lv1');
    expect(got).toContain('nls_nicoad_api_ranking_lv1');
  });

  it('正本 prefix 一覧に主要 6 prefix が含まれる（回帰ガード）', () => {
    for (const p of [
      'nls_event_dom_',
      'nls_koken_api_contrib_',
      'nls_nicoad_api_ranking_',
      'nls_event_participation_',
      'nls_event_score_ranking_',
      'nls_nicoad_ranking_'
    ]) {
      expect(PRUNABLE_STORAGE_KEY_PREFIXES).toContain(p);
    }
  });
});

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

/**
 * ★v0.1.1301(Codex レビュー指摘・重大度中)の回帰。
 *
 * v0.1.1300 で応援レーン鏡を配信ごとキーへ分離した結果、
 * 視聴した配信の数だけキーが増えるようになった(旧実装は単一キー1本=lifecycle 不要だった)。
 * 削除する人が居ないと無界蓄積する(実機で nls_event_dom_* が 513件まで膨れた前例あり)。
 */
describe('配信ごと応援レーン鏡の lifecycle(v0.1.1301)', () => {
  it('★配信ごと鏡と受領証は prune 対象に入る(無界蓄積を防ぐ)', () => {
    const picked = pickPrunableStorageKeys([
      'nls_lane_mirror_v2_lv351133862',
      'nls_lane_receipt_v1_lv351133862'
    ]);
    expect(picked).toContain('nls_lane_mirror_v2_lv351133862');
    expect(picked).toContain('nls_lane_receipt_v1_lv351133862');
  });

  it('★旧グローバルキー(単一・配信をまたぐ)は prune 対象にしない', () => {
    // nls_lane_mirror_v1 は per-live ではないので TTL/LRU の対象にすると
    // 「今使っている鏡」を消しかねない。prefix が末尾 '_' なので一致しないことを固定する。
    expect(pickPrunableStorageKeys(['nls_lane_mirror_v1'])).toEqual([]);
  });

  it('★巨大なコメント配列は引き続き対象外(prune のために読まない)', () => {
    expect(pickPrunableStorageKeys(['nls_comments_lv351133862'])).toEqual([]);
  });
});

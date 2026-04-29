/**
 * D-4: 0.1.7 で誤って焼き込まれた `selfPosted: true` を剥がす後方互換 migration の契約。
 *
 * 0.1.10 で `filterValidSelfPostedRecents` に TTL ガードを入れたが、それ以前の
 * バージョンで「24h 超過の自コメ recent と他人の同テキスト後発コメントが誤マッチ」
 * したまま storage に焼き込まれた `selfPosted: true` 行は剥がれない（forward-only）。
 *
 * 本 migration は `previousVersion < '0.1.10'` から自動更新したユーザーで 1 度だけ
 * 走り、`nls_comments_*` の各行から `selfPosted: true` を物理削除する。剥がした
 * 結果として真に自コメだったものは、次の persist サイクルで `consumeMatchedSelfPostedRecents`
 * が正しく再判定して焼き直すため副作用がない。
 */

import { describe, expect, it } from 'vitest';
import {
  stripStaleSelfPostedFlags,
  shouldRunStaleSelfPostedMigration,
  STALE_SELFPOSTED_MIGRATION_DONE_KEY,
  STALE_SELFPOSTED_MIGRATION_BASELINE_VERSION
} from './migrateClearStaleSelfPosted.js';

describe('shouldRunStaleSelfPostedMigration', () => {
  it('previousVersion なし（fresh install）→ skip', () => {
    expect(shouldRunStaleSelfPostedMigration(undefined, false)).toBe(false);
    expect(shouldRunStaleSelfPostedMigration(null, false)).toBe(false);
    expect(shouldRunStaleSelfPostedMigration('', false)).toBe(false);
  });

  it('done フラグ済 → skip', () => {
    expect(shouldRunStaleSelfPostedMigration('0.1.7', true)).toBe(false);
  });

  it('previousVersion >= 0.1.10 → skip（既に TTL 強化版で動いている）', () => {
    expect(shouldRunStaleSelfPostedMigration('0.1.10', false)).toBe(false);
    expect(shouldRunStaleSelfPostedMigration('0.1.11', false)).toBe(false);
    expect(shouldRunStaleSelfPostedMigration('0.2.0', false)).toBe(false);
    expect(shouldRunStaleSelfPostedMigration('1.0.0', false)).toBe(false);
  });

  it('previousVersion < 0.1.10 → run', () => {
    expect(shouldRunStaleSelfPostedMigration('0.1.7', false)).toBe(true);
    expect(shouldRunStaleSelfPostedMigration('0.1.8', false)).toBe(true);
    expect(shouldRunStaleSelfPostedMigration('0.1.9', false)).toBe(true);
    expect(shouldRunStaleSelfPostedMigration('0.1.6', false)).toBe(true);
    expect(shouldRunStaleSelfPostedMigration('0.0.1', false)).toBe(true);
  });

  it('既知の baseline version 定数', () => {
    expect(STALE_SELFPOSTED_MIGRATION_BASELINE_VERSION).toBe('0.1.10');
  });

  it('done flag のキー名は固定（drift しないこと）', () => {
    expect(STALE_SELFPOSTED_MIGRATION_DONE_KEY).toBe(
      'nls_migration_clear_stale_selfposted_done_v1'
    );
  });

  it('不正な previousVersion 文字列は安全に skip', () => {
    expect(shouldRunStaleSelfPostedMigration('not-a-version', false)).toBe(false);
    expect(shouldRunStaleSelfPostedMigration('abc.def.ghi', false)).toBe(false);
  });
});

describe('stripStaleSelfPostedFlags', () => {
  it('入力が配列でない場合は { next: [], strippedCount: 0 } を返す', () => {
    expect(stripStaleSelfPostedFlags(null)).toEqual({ next: [], strippedCount: 0 });
    expect(stripStaleSelfPostedFlags(undefined)).toEqual({ next: [], strippedCount: 0 });
    expect(stripStaleSelfPostedFlags('not-array')).toEqual({ next: [], strippedCount: 0 });
    expect(stripStaleSelfPostedFlags({})).toEqual({ next: [], strippedCount: 0 });
  });

  it('selfPosted を持たない行は触らない（参照同一性は変えてよい）', () => {
    const input = [
      { id: 'a', text: 'こんにちは' },
      { id: 'b', text: 'やっほー' }
    ];
    const result = stripStaleSelfPostedFlags(input);
    expect(result.strippedCount).toBe(0);
    expect(result.next).toEqual(input);
  });

  it('selfPosted: true がある行は selfPosted フィールドだけを物理削除する', () => {
    const input = [
      { id: 'a', text: 'こんにちは', selfPosted: true },
      { id: 'b', text: 'やっほー' }
    ];
    const result = stripStaleSelfPostedFlags(input);
    expect(result.strippedCount).toBe(1);
    expect(result.next).toHaveLength(2);
    expect(result.next[0]).not.toHaveProperty('selfPosted');
    expect(result.next[0]).toMatchObject({ id: 'a', text: 'こんにちは' });
    expect(result.next[1]).toEqual({ id: 'b', text: 'やっほー' });
  });

  it('selfPosted: false（明示 false）も削除（不要な field を残さない）', () => {
    const input = [{ id: 'a', text: 'x', selfPosted: false }];
    const result = stripStaleSelfPostedFlags(input);
    expect(result.strippedCount).toBe(0); // false は数えない
    expect(result.next[0]).not.toHaveProperty('selfPosted');
  });

  it('複数件まとめて剥がす', () => {
    const input = [
      { id: 'a', text: 'x', selfPosted: true },
      { id: 'b', text: 'y' },
      { id: 'c', text: 'z', selfPosted: true },
      { id: 'd', text: 'w', selfPosted: true }
    ];
    const result = stripStaleSelfPostedFlags(input);
    expect(result.strippedCount).toBe(3);
    for (const row of result.next) {
      expect(row).not.toHaveProperty('selfPosted');
    }
    expect(result.next.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('入力配列を mutate しない（イミュータブル）', () => {
    const input = [{ id: 'a', text: 'x', selfPosted: true }];
    const inputClone = JSON.parse(JSON.stringify(input));
    stripStaleSelfPostedFlags(input);
    expect(input).toEqual(inputClone); // 元データは変わらない
  });

  it('行が null / 非オブジェクトの場合はそのまま通す（壊さない）', () => {
    const input = [
      null,
      undefined,
      { id: 'a', selfPosted: true },
      'string-row'
    ];
    const result = stripStaleSelfPostedFlags(input);
    expect(result.strippedCount).toBe(1);
    expect(result.next).toHaveLength(4);
    expect(result.next[0]).toBeNull();
    expect(result.next[1]).toBeUndefined();
    expect(result.next[2]).not.toHaveProperty('selfPosted');
    expect(result.next[3]).toBe('string-row');
  });
});

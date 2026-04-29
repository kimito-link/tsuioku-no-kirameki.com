/**
 * H1 / E-15: pending self-post entry の判定を表示経路で共通化する。
 *
 * `buildDisplayCommentEntries` が `pending-self:lvX:itemIdx:at` 形式の id で
 * 合成エントリを作る。これらの entry は ndgr 観測前の状態であり：
 *   ・184 投稿だった場合、観測後 entry.userId は `a:HASH` に切り替わる
 *   ・pending の段階では viewerUid（数値）を仮置きしている
 *
 * → Story Detail だけでなく、rank strip / ticker / Growth icon など全表示経路で
 *   pending self-post を識別して、viewer の数値 ID を表示・リンク化しないように
 *   ガードする。本 helper はそのための一元判定。
 */

import { describe, expect, it } from 'vitest';
import { isPendingSelfPostEntry } from './popupEntryPendingSelfPost.js';

describe('isPendingSelfPostEntry', () => {
  it('id が "pending-self:" で始まれば true', () => {
    expect(isPendingSelfPostEntry({ id: 'pending-self:lv12345:0:1700000000' })).toBe(true);
    expect(isPendingSelfPostEntry({ id: 'pending-self:LV12345:3:0' })).toBe(true);
  });

  it('id が "pending-self:" で始まらない通常 entry は false', () => {
    expect(isPendingSelfPostEntry({ id: 'c_1700000000_abcdef12' })).toBe(false);
    expect(isPendingSelfPostEntry({ id: 'nl-lane:12345' })).toBe(false);
    expect(isPendingSelfPostEntry({ id: 'legacy:lv1||hello|1700000000' })).toBe(false);
  });

  it('id が空文字 / undefined / 数値 → false', () => {
    expect(isPendingSelfPostEntry({ id: '' })).toBe(false);
    expect(isPendingSelfPostEntry({ id: undefined })).toBe(false);
    expect(isPendingSelfPostEntry({ id: 0 })).toBe(false);
    expect(isPendingSelfPostEntry({ id: null })).toBe(false);
  });

  it('null / undefined / 非オブジェクト → false', () => {
    expect(isPendingSelfPostEntry(null)).toBe(false);
    expect(isPendingSelfPostEntry(undefined)).toBe(false);
    // @ts-expect-error 意図的に不正
    expect(isPendingSelfPostEntry('pending-self:lv1:0:0')).toBe(false);
    // @ts-expect-error 意図的に不正
    expect(isPendingSelfPostEntry(42)).toBe(false);
  });

  it('id が無い空オブジェクト → false', () => {
    expect(isPendingSelfPostEntry({})).toBe(false);
  });

  it('"pending-self" だけ（コロン無し）→ false（プレフィックス完全一致を要求）', () => {
    expect(isPendingSelfPostEntry({ id: 'pending-self' })).toBe(false);
    expect(isPendingSelfPostEntry({ id: 'pending-self-x:lv1:0:0' })).toBe(false);
  });

  it('大小文字違いのプレフィックスは別扱い（false）', () => {
    expect(isPendingSelfPostEntry({ id: 'Pending-Self:lv1:0:0' })).toBe(false);
    expect(isPendingSelfPostEntry({ id: 'PENDING-SELF:lv1:0:0' })).toBe(false);
  });
});

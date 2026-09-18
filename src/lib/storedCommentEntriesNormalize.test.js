import { describe, expect, it } from 'vitest';
import { normalizeStoredCommentEntries } from './storedCommentEntriesNormalize.js';

/**
 * characterization test（元の挙動を固定）。
 * popup-entry.js から Track A で切り出した normalizeStoredCommentEntries の
 * 入出力を、切り出し前と同じであることを固定する。
 *
 * dedupe キーは storedCommentDedupeKey が正本。数字 commentNo は `no:<num>` で
 * 一意に決まるので、テストは主に数字 commentNo を使って決定的に組む。
 */

const row = (e) => ({ commentNo: '', liveId: 'lv1', userId: '', text: '', ...e });

describe('normalizeStoredCommentEntries（切り出し前と同じ）', () => {
  it('配列でなければ next=[]・changed=false', () => {
    expect(normalizeStoredCommentEntries(/** @type {any} */ (null))).toEqual({
      next: [],
      changed: false
    });
  });

  it('要素1件以下はそのまま返す（同一参照・changed=false）', () => {
    const one = [row({ commentNo: '1', text: 'あ' })];
    const r = normalizeStoredCommentEntries(one);
    expect(r.next).toBe(one);
    expect(r.changed).toBe(false);
  });

  it('異なる数字 commentNo は重複しない（全件残る・changed=false）', () => {
    const list = [
      row({ commentNo: '1', text: 'あ' }),
      row({ commentNo: '2', text: 'い' }),
      row({ commentNo: '3', text: 'う' })
    ];
    const r = normalizeStoredCommentEntries(list);
    expect(r.next).toHaveLength(3);
    expect(r.changed).toBe(false);
  });

  it('同じ数字 commentNo は 1 行にマージ（changed=true・件数が減る）', () => {
    const list = [
      row({ commentNo: '10', text: 'やあ', userId: '111' }),
      row({ commentNo: '10', text: 'やあ', userId: '111' })
    ];
    const r = normalizeStoredCommentEntries(list);
    expect(r.next).toHaveLength(1);
    expect(r.changed).toBe(true);
  });

  it('マージ後も最初の出現位置に残る（順序保存）', () => {
    const list = [
      row({ commentNo: '1', text: 'first' }),
      row({ commentNo: '2', text: 'dup-a', userId: '1' }),
      row({ commentNo: '3', text: 'last' }),
      row({ commentNo: '2', text: 'dup-a', userId: '1' })
    ];
    const r = normalizeStoredCommentEntries(list);
    expect(r.next.map((e) => e.commentNo)).toEqual(['1', '2', '3']);
    expect(r.changed).toBe(true);
  });

  it('数字でない commentNo は text/uid/時刻バケットで判定（同一なら統合）', () => {
    // commentNo が空 → t:<liveId>|<uid>|<text>|<bucket> キー。
    const list = [
      row({ commentNo: '', liveId: 'lvX', userId: 'u1', text: 'こんばんは', capturedAt: 1000 }),
      row({ commentNo: '', liveId: 'lvX', userId: 'u1', text: 'こんばんは', capturedAt: 1000 })
    ];
    const r = normalizeStoredCommentEntries(list);
    expect(r.next).toHaveLength(1);
    expect(r.changed).toBe(true);
  });
});

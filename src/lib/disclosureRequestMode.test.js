import { describe, it, expect } from 'vitest';
import {
  detectDisclosureFlaggedComment,
  filterCommentsForDisclosureDisplay,
  countDisclosureHiddenComments,
  collectDisclosureFlaggedCommentEntries,
  normalizeDisclosureRequestModeEnabled,
  isDisclosureProtectedCommentEntry
} from './disclosureRequestMode.js';

describe('disclosureRequestMode', () => {
  it('きつい文言を検知する', () => {
    expect(detectDisclosureFlaggedComment('うざい')).toMatchObject({
      ruleId: 'harsh-insult',
      level: 'mild'
    });
  });

  it('ギフト・自分投稿は保護対象', () => {
    expect(
      isDisclosureProtectedCommentEntry({
        text: 'シンラツさんがギフト「応援メガホン 黄（10pt）」を贈りました'
      })
    ).toBe(true);
    expect(isDisclosureProtectedCommentEntry({ text: 'うざい', selfPosted: true })).toBe(true);
  });

  it('表示フィルタで該当疑いのみ除外', () => {
    const entries = [
      { text: '応援してる', userId: '1' },
      { text: 'うざい', userId: '2' },
      { text: '8888', selfPosted: true, userId: '3' }
    ];
    const visible = filterCommentsForDisclosureDisplay(entries);
    expect(visible).toHaveLength(2);
    expect(countDisclosureHiddenComments(entries)).toBe(1);
  });

  it('collectDisclosureFlaggedCommentEntries', () => {
    const rows = collectDisclosureFlaggedCommentEntries([
      { id: 'a', commentNo: '10', text: '死ね', userId: '99' }
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].disclosureFlag.ruleId).toBe('direct-harm');
  });

  it('normalizeDisclosureRequestModeEnabled', () => {
    expect(normalizeDisclosureRequestModeEnabled(true)).toBe(true);
    expect(normalizeDisclosureRequestModeEnabled(false)).toBe(false);
    expect(normalizeDisclosureRequestModeEnabled(undefined)).toBe(false);
  });
});

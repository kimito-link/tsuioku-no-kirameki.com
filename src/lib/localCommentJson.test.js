import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildLocalCommentSnapshot, localCommentBodyKey } from './localCommentJson.js';

describe('手元のコメントJSON', () => {
  it('直近80件、本文200字、決まった欄だけ', () => {
    const rows = Array.from({ length: 90 }, (_, i) => ({
      at: i + 1,
      no: String(i + 1),
      userId: String(1000 + i),
      name: `表示${i}`,
      text: i === 89 ? `${'あ'.repeat(250)}` : `本文${i}`,
      avatarUrl: 'https://example.invalid/a.jpg'
    }));
    const snapshot = /** @type {any} */ (buildLocalCommentSnapshot(rows, 50, 'lv1'));
    expect(snapshot.comments).toHaveLength(80);
    expect(snapshot.comments[0].no).toBe('11');
    const shuffled = [rows[89], rows[0], rows[50]];
    const latest = /** @type {any} */ (buildLocalCommentSnapshot(shuffled, 1, 'lv1'));
    expect(latest.comments.map((row) => row.no)).toEqual(['1', '51', '90']);
    expect(snapshot.comments.at(-1).text).toHaveLength(200);
    expect(snapshot.comments[0].avatarUrl).toBeUndefined();
    expect(snapshot.limits.listen).toBe(false);
    expect(snapshot.access).toBe('read-only');
    expect(snapshot.ranking).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain('example.invalid');
  });

  it('空の本文は落とす。時刻を変えても本文の印は同じ', () => {
    const rows = [{ at: 1, no: '1', userId: '2', name: '表示', text: '   ' }, { text: '残す', at: 2, no: '2', name: '名' }];
    const first = buildLocalCommentSnapshot(rows, 1, 'lv9');
    const second = buildLocalCommentSnapshot(rows, 9, 'lv9');
    expect(/** @type {any} */ (first).comments).toHaveLength(1);
    expect(localCommentBodyKey(first)).toBe(localCommentBodyKey(second));
  });

  it('外へ取りに行かない', () => {
    const lib = readFileSync(new URL('./localCommentJson.js', import.meta.url), 'utf8');
    expect(lib).not.toMatch(/fetch\(|XMLHttpRequest|https?:\/\//);
  });
});

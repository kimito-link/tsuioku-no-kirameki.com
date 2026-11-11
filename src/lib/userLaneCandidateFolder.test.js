import { describe, expect, it } from 'vitest';
import { createUserLaneCandidateFolder, userLaneCandidatesFromStorage } from './userLaneCandidatesFromStorage.js';
import { createAggregateCommentsFolder, aggregateCommentsByUser } from './userRooms.js';

describe('createUserLaneCandidateFolder', () => {
  it('分割して足しても、一度に数えた結果と同じ', () => {
    const rows = [];
    for (let i = 0; i < 30; i += 1) {
      rows.push({
        userId: `u${i % 5}`,
        nickname: i % 2 ? '長い名前だよ' : '短',
        text: `本文${i}`,
        capturedAt: 1_000 + i,
        liveId: 'lv1',
        avatarUrl: i % 5 === 0 ? 'https://example.com/a.png' : ''
      });
    }
    const opts = { broadcasterUid: 'caster', broadcasterIconUrl: 'https://example.com/caster.png', requireText: true };
    const once = userLaneCandidatesFromStorage(rows, 'lv1', opts);
    const folder = createUserLaneCandidateFolder('lv1', opts, true);
    folder.add(rows.slice(0, 12));
    const twice = folder.add(rows.slice(12));
    expect(twice).toEqual(once);
  });

  it('4万件のうしろに足す分は50ms以内', () => {
    const rows = [];
    for (let i = 0; i < 40000; i += 1) {
      rows.push({ userId: `u${i % 80}`, nickname: `n${i % 80}`, text: `t${i}`, capturedAt: i + 1, liveId: 'lv1' });
    }
    const folder = createUserLaneCandidateFolder('lv1', { requireText: true }, true);
    folder.add(rows.slice(0, 39000));
    const t0 = performance.now();
    const out = folder.add(rows.slice(39000));
    expect(performance.now() - t0).toBeLessThan(50);
    expect(out).toHaveLength(80);
    expect(out.reduce((s, r) => s + Number(r.commentCount || 0), 0)).toBe(40000);
  });
});

describe('createAggregateCommentsFolder', () => {
  it('分割して足しても、一度に数えた件数と同じ', () => {
    const rows = [];
    for (let i = 0; i < 20; i += 1) {
      rows.push({ userId: `u${i % 4}`, nickname: `n${i % 4}`, text: `t${i}`, capturedAt: 500 + i });
    }
    const once = aggregateCommentsByUser(rows, { requireText: true });
    const folder = createAggregateCommentsFolder({ requireText: true });
    folder.add(rows.slice(0, 7));
    const twice = folder.add(rows.slice(7));
    expect(twice).toEqual(once);
  });
});

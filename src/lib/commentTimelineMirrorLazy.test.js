import { describe, it, expect } from 'vitest';
import { buildCommentTimelineMirrorSnapshot, TIMELINE_MIRROR_CAP } from './commentTimelineMirror.js';

// v0.1.1981: 鏡の形に直すのを「最新 cap 件だけ」にした。結果が前と同じこと・直す回数が行数に比例しないことを固定する。
describe('buildCommentTimelineMirrorSnapshot(v0.1.1981: 直すのは載る行だけ)', () => {
  const rows = (n) =>
    Array.from({ length: n }, (_, i) => ({
      capturedAt: 1_000_000 + ((i * 7919) % n) * 10, // 時刻は並び順とずらす
      text: i % 50 === 0 ? '' : `c${i}`,
      userId: `u${i % 37}`,
      nickname: i % 50 === 0 && i % 100 === 0 ? '' : `n${i % 37}`,
      commentNo: String(i + 1)
    }));

  it('最新 cap 件・totalSeen・並びは、全行を直してから取る素直なやり方と同じ', () => {
    const comments = rows(5000);
    const gifts = [{ capturedAt: 1_030_000, userId: 'g1', nickname: 'gifter', itemName: 'star', point: 300 }, null, { text: '', nickname: '' }];
    const resolveName = (c) => String(c.nickname || '');
    const resolveAvatar = (c) => (c.userId === 'u3' ? 'https://example.com/a.png' : '');
    const got = buildCommentTimelineMirrorSnapshot({ liveId: 'lv1', comments, giftEvents: gifts, capturedAt: 5, resolveName, resolveAvatar });
    // 素直なやり方: 1行だけの配信として1行ずつ直し(=toTimelineRow の結果)、時刻順に並べて末尾 cap 件
    const one = (it, gift) => {
      const snap = buildCommentTimelineMirrorSnapshot({ liveId: 'lv1', comments: gift ? [] : [it], giftEvents: gift ? [it] : [], capturedAt: 5, resolveName, resolveAvatar });
      return snap ? snap.rows[0] : null;
    };
    const all = [...comments.map((c) => one(c, false)), ...gifts.map((g) => one(g, true))].filter(Boolean);
    all.sort((x, y) => (x.at || 0) - (y.at || 0));
    expect(got?.totalSeen).toBe(all.length);
    expect(got?.rows).toEqual(all.slice(-TIMELINE_MIRROR_CAP));
  });

  it('8万行でも、名前と顔の解決は最新 cap 件ぶん+本文の無い行ぶんだけ', () => {
    const comments = Array.from({ length: 80_000 }, (_, i) => ({ capturedAt: 1 + i, text: `c${i}`, userId: `u${i % 6500}`, nickname: 'n' }));
    let calls = 0;
    const snap = buildCommentTimelineMirrorSnapshot({
      liveId: 'lv1', comments, capturedAt: 5,
      resolveName: (c) => { calls += 1; return String(c.nickname); },
      resolveAvatar: () => ''
    });
    expect(snap?.totalSeen).toBe(80_000);
    expect(snap?.rows.length).toBe(TIMELINE_MIRROR_CAP);
    expect(snap?.rows.at(-1)?.text).toBe('c79999');
    expect(calls).toBeLessThanOrEqual(TIMELINE_MIRROR_CAP);
  });
});

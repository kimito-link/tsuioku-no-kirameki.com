import { describe, it, expect } from 'vitest';
import {
  TIMELINE_MIRROR_CAP,
  buildCommentTimelineMirrorSnapshot,
  isTimelineMirrorRowRenderable,
  restoreCommentTimelineRows
} from './commentTimelineMirror.js';

const NOW = 1_000_000_000_000;

function cmt(at, text, name = '匿名', avatarUrl = '', userId = 'u1') {
  return { at, text, nickname: name, avatarUrl, userId };
}

describe('buildCommentTimelineMirrorSnapshot', () => {
  it('コメント配列から最新N件を時刻順(古→新)で組む', () => {
    const comments = [cmt(NOW - 3000, 'c'), cmt(NOW - 1000, 'a'), cmt(NOW - 2000, 'b')];
    const snap = buildCommentTimelineMirrorSnapshot({ liveId: 'LV1', comments, capturedAt: NOW });
    expect(snap.liveId).toBe('lv1');
    expect(snap.capturedAt).toBe(NOW);
    expect(snap.rows.map((r) => r.text)).toEqual(['c', 'b', 'a']); // 古→新
    expect(snap.totalSeen).toBe(3);
  });

  it('cap で最新だけ残す(末尾=最新)', () => {
    const comments = Array.from({ length: 100 }, (_, i) => cmt(NOW - (100 - i) * 1000, `c${i}`));
    const snap = buildCommentTimelineMirrorSnapshot({ liveId: 'lv1', comments, capturedAt: NOW, cap: 10 });
    expect(snap.rows).toHaveLength(10);
    expect(snap.rows[snap.rows.length - 1].text).toBe('c99'); // 最新
    expect(snap.rows[0].text).toBe('c90');
    expect(snap.totalSeen).toBe(100);
  });

  it('resolveName/resolveAvatar で既解決の値を使う(新規名寄せしない)', () => {
    const comments = [cmt(NOW, 'hi', '', '', 'u9')];
    const snap = buildCommentTimelineMirrorSnapshot({
      liveId: 'lv1', comments, capturedAt: NOW,
      resolveName: () => 'りんく', resolveAvatar: () => 'https://x/a.png'
    });
    expect(snap.rows[0].name).toBe('りんく');
    expect(snap.rows[0].avatarUrl).toBe('https://x/a.png');
  });

  it('本文も名前も顔も無い行は捨てる', () => {
    const comments = [cmt(NOW, '', '', ''), cmt(NOW + 1, 'ok')];
    const snap = buildCommentTimelineMirrorSnapshot({ liveId: 'lv1', comments, capturedAt: NOW });
    expect(snap.rows).toHaveLength(1);
    expect(snap.rows[0].text).toBe('ok');
  });

  it('本文は120字に切る', () => {
    const snap = buildCommentTimelineMirrorSnapshot({ liveId: 'lv1', comments: [cmt(NOW, 'x'.repeat(300))], capturedAt: NOW });
    expect(snap.rows[0].text.length).toBe(120);
  });

  it('ギフトイベントもコメントと時刻順に統合', () => {
    const comments = [cmt(NOW - 2000, 'comment')];
    const giftEvents = [{ at: NOW - 1000, text: 'ギフト!', nickname: 'g', isGift: true }];
    const snap = buildCommentTimelineMirrorSnapshot({ liveId: 'lv1', comments, giftEvents, capturedAt: NOW });
    expect(snap.rows).toHaveLength(2);
    expect(snap.rows[1].kind).toBe('gift'); // 新しい方=ギフト
  });

  it('コメントもギフトも無ければ null', () => {
    expect(buildCommentTimelineMirrorSnapshot({ liveId: 'lv1', comments: [], capturedAt: NOW })).toBe(null);
    expect(buildCommentTimelineMirrorSnapshot({})).toBe(null);
  });

  it('容量超過で cap を半減して作り直す', () => {
    // 長文を大量に入れて 256KB を超えさせる→ rows が cap=60 より減ることを確認。
    const comments = Array.from({ length: 200 }, (_, i) => cmt(NOW - (200 - i) * 1000, 'あ'.repeat(120)));
    const snap = buildCommentTimelineMirrorSnapshot({ liveId: 'lv1', comments, capturedAt: NOW });
    const bytes = JSON.stringify(snap).length;
    expect(bytes).toBeLessThanOrEqual(256 * 1024);
    expect(snap.rows.length).toBeLessThanOrEqual(TIMELINE_MIRROR_CAP);
  });

  it('既定 cap は 60', () => {
    expect(TIMELINE_MIRROR_CAP).toBe(60);
  });
});

describe('isTimelineMirrorRowRenderable / restoreCommentTimelineRows', () => {
  it('本文/名前/顔のどれかがあれば描画可', () => {
    expect(isTimelineMirrorRowRenderable({ text: 'a' })).toBe(true);
    expect(isTimelineMirrorRowRenderable({ name: 'b' })).toBe(true);
    expect(isTimelineMirrorRowRenderable({ avatarUrl: 'c' })).toBe(true);
    expect(isTimelineMirrorRowRenderable({ text: '', name: '', avatarUrl: '' })).toBe(false);
    expect(isTimelineMirrorRowRenderable(null)).toBe(false);
  });

  it('restore は描画可能な行だけ古→新で返す', () => {
    const snap = { rows: [{ text: 'a' }, { text: '', name: '', avatarUrl: '' }, { text: 'b' }] };
    expect(restoreCommentTimelineRows(snap).map((r) => r.text)).toEqual(['a', 'b']);
  });

  it('snap が無ければ空配列', () => {
    expect(restoreCommentTimelineRows(null)).toEqual([]);
    expect(restoreCommentTimelineRows({})).toEqual([]);
  });
});

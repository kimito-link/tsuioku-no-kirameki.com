import { describe, it, expect } from 'vitest';
import {
  TIMELINE_MIRROR_CAP,
  buildCommentTimelineMirrorSnapshot,
  isTimelineMirrorRowRenderable,
  restoreCommentTimelineRows,
  restoreTimelineItemsForHtml
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

  it('ギフト行は itemName/point を保持する(③応援タイムライン丸写し・第1号)', () => {
    const giftEvents = [{ at: NOW, text: 'スパチャ', nickname: 'g', isGift: true, itemName: 'スーパーコメット', point: 14280 }];
    const snap = buildCommentTimelineMirrorSnapshot({ liveId: 'lv1', comments: [], giftEvents, capturedAt: NOW });
    expect(snap.rows[0].kind).toBe('gift');
    expect(snap.rows[0].itemName).toBe('スーパーコメット');
    expect(snap.rows[0].point).toBe(14280);
  });

  it('コメント行には itemName/point を付けない(容量ムダを避ける)', () => {
    const snap = buildCommentTimelineMirrorSnapshot({ liveId: 'lv1', comments: [cmt(NOW, 'ただのコメント')], capturedAt: NOW });
    expect(snap.rows[0].kind).toBe('comment');
    expect(snap.rows[0]).not.toHaveProperty('itemName');
    expect(snap.rows[0]).not.toHaveProperty('point');
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

describe('restoreTimelineItemsForHtml — 鏡rows→TimelineItem[](③応援タイムライン丸写し・第1号)', () => {
  // 鏡 row の形: { at, name, text, avatarUrl, userId, kind }（commentTimelineMirror.js:15 typedef）
  function mrow(at, text, { name = '匿名', avatarUrl = '', userId = 'u1', kind = 'comment', itemName, point } = {}) {
    const r = { at, text, name, avatarUrl, userId, kind };
    if (itemName != null) r.itemName = itemName;
    if (point != null) r.point = point;
    return r;
  }

  it('鏡は古→新だが TimelineItem は新しい順(desc)で返す(①の order:desc と揃える)', () => {
    const snap = { rows: [mrow(NOW - 3000, 'old'), mrow(NOW - 2000, 'mid'), mrow(NOW - 1000, 'new')] };
    const items = restoreTimelineItemsForHtml(snap);
    expect(items.map((i) => i.text)).toEqual(['new', 'mid', 'old']); // desc
  });

  it('name→nickname / commentNo="" / selfPosted=false のフィールド写像', () => {
    const snap = { rows: [mrow(NOW, 'hi', { name: 'りんく', userId: 'u9', avatarUrl: 'https://x/a.png' })] };
    const [it] = restoreTimelineItemsForHtml(snap);
    expect(it.kind).toBe('comment');
    expect(it.nickname).toBe('りんく');
    expect(it.text).toBe('hi');
    expect(it.avatarUrl).toBe('https://x/a.png');
    expect(it.userId).toBe('u9');
    expect(it.commentNo).toBe('');
    expect(it.selfPosted).toBe(false);
  });

  it('key は kind:userId:at:index の一意合成(userId無しは anon)', () => {
    // 鏡rows は常に古→新(buildCommentTimelineMirrorSnapshot 保証)。b(古)→a(新) の順で渡す。
    const snap = { rows: [mrow(NOW - 2000, 'b', { userId: '' }), mrow(NOW - 1000, 'a', { userId: 'u1' })] };
    const items = restoreTimelineItemsForHtml(snap);
    // index は古→新で採番(b=0, a=1)、その後 desc に reverse=a が先頭。key の index は採番時のまま。
    expect(items[0].text).toBe('a');
    expect(items[0].key).toBe('comment:u1:' + (NOW - 1000) + ':1');
    expect(items[1].text).toBe('b');
    expect(items[1].key).toBe('comment:anon:' + (NOW - 2000) + ':0');
    // key は全件で一意
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
  });

  it('kind=gift は itemName/point を透過し TimelineGiftItem になる', () => {
    const snap = { rows: [mrow(NOW, 'スーパーコメット', { kind: 'gift', name: 'たろう', userId: 'g1', itemName: 'スーパーコメット', point: 14280 })] };
    const [it] = restoreTimelineItemsForHtml(snap);
    expect(it.kind).toBe('gift');
    expect(it.itemName).toBe('スーパーコメット');
    expect(it.point).toBe(14280);
    expect(it.nickname).toBe('たろう');
  });

  it('kind=gift で itemName 欠落なら text をフォールバック名にする', () => {
    const snap = { rows: [mrow(NOW, 'ギフト着弾', { kind: 'gift', point: 100 })] };
    const [it] = restoreTimelineItemsForHtml(snap);
    expect(it.kind).toBe('gift');
    expect(it.itemName).toBe('ギフト着弾'); // text フォールバック
  });

  it('空/不正入力は []', () => {
    expect(restoreTimelineItemsForHtml(null)).toEqual([]);
    expect(restoreTimelineItemsForHtml(undefined)).toEqual([]);
    expect(restoreTimelineItemsForHtml({})).toEqual([]);
    expect(restoreTimelineItemsForHtml({ rows: [] })).toEqual([]);
  });

  it('描画不能な空行(text/name/avatar全無)は除外される(restore と同基準)', () => {
    // 古→新: c(古) → 空行 → a(新)。空行が落ち、desc で a→c。
    const snap = { rows: [mrow(NOW - 3000, 'c'), { at: NOW - 2000, text: '', name: '', avatarUrl: '', userId: 'x', kind: 'comment' }, mrow(NOW - 1000, 'a')] };
    const items = restoreTimelineItemsForHtml(snap);
    expect(items.map((i) => i.text)).toEqual(['a', 'c']); // 空行は落ちる・desc順
  });

  it('summarizeTimelineGifts に渡せる形(gift の point 合算が効く)', () => {
    // アダプタ出力がそのまま summarizeTimelineGifts の入力互換であることの回帰
    const snap = { rows: [
      mrow(NOW - 1000, 'c1', { kind: 'comment' }),
      mrow(NOW - 2000, 'ギフトA', { kind: 'gift', userId: 'g1', itemName: 'A', point: 100 }),
      mrow(NOW - 3000, 'ギフトB', { kind: 'gift', userId: 'g2', itemName: 'B', point: 200 })
    ] };
    const items = restoreTimelineItemsForHtml(snap);
    const gifts = items.filter((i) => i.kind === 'gift');
    expect(gifts).toHaveLength(2);
    expect(gifts.reduce((s, g) => s + g.point, 0)).toBe(300);
  });
});

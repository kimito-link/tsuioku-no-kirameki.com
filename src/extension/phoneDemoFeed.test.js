import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDemoSnapshot, DEMO_LIVE_ID, DEMO_STEP_MS } from '../../app/live-view-demo-feed.js';
import { giftNoticeText, pickNewGiftsForNotice } from '../lib/phoneNativeCues.js';
import { parseViewerLink, savedViewerPath, viewerPathFor } from '../lib/phoneStartLink.js';
import { pickSnapshotLiveId } from '../lib/liveviewCurrentLive.js';
import { restoreCommentTimelineRows } from '../lib/commentTimelineMirror.js';
import { sanitizeLaneMirrorForRead } from '../lib/laneMirrorContract.js';

const base = JSON.parse(readFileSync(new URL('../../app/demo/snapshot.json', import.meta.url), 'utf8'));

describe('デモ(/live-view?v=demo): PC が無くても動く作り物の配信', () => {
  it('★時間がたつほど行が増え、配信番号と時刻は「いま」に揃う', () => {
    const a = buildDemoSnapshot({ base, startedAt: 1_000, nowMs: 1_000 });
    const b = buildDemoSnapshot({ base, startedAt: 1_000, nowMs: 1_000 + DEMO_STEP_MS * 3 });
    expect(pickSnapshotLiveId(a)).toBe(DEMO_LIVE_ID);
    expect(restoreCommentTimelineRows(a.commentTimelineMirror).length).toBe(12);
    expect(restoreCommentTimelineRows(b.commentTimelineMirror).length).toBe(15);
    expect(b.laneMirror.capturedAt).toBe(1_000 + DEMO_STEP_MS * 3);
    expect(b.statusReport).toBeNull();
  });

  it('★新しく流れてきたギフトだけが通知の対象になる(開いた瞬間の分は知らせない)', () => {
    let seen = null;
    let total = 0;
    for (let k = 0; k < 20; k += 1) {
      const snap = buildDemoSnapshot({ base, startedAt: 0, nowMs: k * DEMO_STEP_MS });
      const r = pickNewGiftsForNotice({ rows: restoreCommentTimelineRows(snap.commentTimelineMirror), seen });
      if (k === 0) expect(r.gifts).toHaveLength(0);
      total += r.gifts.length;
      seen = r.seen;
    }
    expect(total).toBeGreaterThan(0);
  });

  it('★見本は作り物だけ: 実在の画像サーバー・実在の桁の ID を含まない。応援レーンは関所を通る', () => {
    const text = JSON.stringify(base);
    expect(text).not.toMatch(/nimg\.jp|nicovideo\.jp\/user|dlive\.nicovideo/);
    const ids = [...text.matchAll(/"userId":"([^"]*)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) expect(id).toMatch(/^(99999900\d\d|a:demo\d{4})$/);
    const r = sanitizeLaneMirrorForRead(base.laneMirror);
    expect(r.droppedLinkAnon + r.droppedKontaAnon + r.droppedUnkeyed).toBe(0);
    expect(r.snap.link.length).toBeGreaterThan(0);
  });
});

describe('通知の文面', () => {
  it('1件なら誰から何が、複数なら件数と合計', () => {
    expect(giftNoticeText([{ name: 'そら', itemName: '花火', point: 1000 }])).toEqual({ title: '🎁 ギフトが届きました', body: 'そら さんから 花火(1000pt)' });
    expect(giftNoticeText([{ name: 'a', itemName: 'x', point: 100 }, { name: 'b', itemName: 'y', point: 50 }])?.title).toBe('🎁 ギフトが 2 件届きました');
    expect(giftNoticeText([])).toBeNull();
  });
});

describe('開始画面: 貼られたリンクを読む', () => {
  const pk = 'k'.repeat(40);
  it('★自分のサイトの /live-view のリンクとトークンだけを受け付ける', () => {
    expect(parseViewerLink(`https://app.tsuioku-no-kirameki.com/live-view?v=abcdEFGH12#pk=${pk}`)).toEqual({ token: 'abcdEFGH12', postKey: pk });
    expect(parseViewerLink('abcdEFGH12')).toEqual({ token: 'abcdEFGH12', postKey: '' });
    expect(parseViewerLink('https://evil.example/live-view?v=abcdEFGH12')).toBeNull();
    expect(parseViewerLink('http://app.tsuioku-no-kirameki.com/live-view?v=abcdEFGH12')).toBeNull();
    expect(parseViewerLink('https://app.tsuioku-no-kirameki.com/other?v=abcdEFGH12')).toBeNull();
    expect(parseViewerLink('')).toBeNull();
  });
  it('開く先と覚える値', () => {
    expect(viewerPathFor({ token: 'abcdEFGH12', postKey: pk })).toBe(`/live-view?v=abcdEFGH12#pk=${pk}`);
    expect(savedViewerPath('/live-view?v=abcdEFGH12')).toBe('/live-view?v=abcdEFGH12');
    expect(savedViewerPath('https://evil.example/')).toBe('');
    expect(savedViewerPath(null)).toBe('');
  });
});

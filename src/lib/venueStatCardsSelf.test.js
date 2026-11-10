import { describe, it, expect, vi } from 'vitest';
import { buildStatCardsFromWatchSnapshot, createVenueStatSelfPoller, requestWatchSnapshotViaTabs, VENUE_STAT_SELF_INTERVAL_MS } from './venueStatCardsSelf.js';
import { buildVenueStatStripModel } from './venueStatStrip.js';

const NOW = 1_800_000_000_000;
const byKey = (m) => Object.fromEntries(m.items.map((i) => [i.key, i]));

/** ニコ生の視聴ページのスナップショット(公式の統計が取れている配信) */
const nicoSnap = (over = {}) => ({
  liveId: 'lv123',
  viewerCountFromDom: 3500,
  officialViewerCount: 3500,
  officialCommentCount: 567,
  officialStatsUpdatedAt: NOW - 10_000,
  streamAgeMin: 156,
  recentActiveUsers: 40,
  ...over
});
/** YouTube 等(ytNicoShim の ytSummaryToNicoSnapshot と同じ形: 同接は公式の直接値・延べの来場は無い) */
const ytSnap = (over = {}) => ({
  liveId: 'lv900000001',
  viewerCountFromDom: null,
  noVisitorTotal: true,
  recordedCountHint: 6352,
  officialViewerCount: 83448,
  officialStatsUpdatedAt: NOW - 5_000,
  streamAgeMin: 109,
  ...over
});

describe('buildStatCardsFromWatchSnapshot', () => {
  it('ニコ生: 来場者数・経過・本家コメが、パネルと同じ部品で出る', () => {
    const snap = buildStatCardsFromWatchSnapshot({ snapshot: nicoSnap(), recordedCount: 81 }, { liveId: 'lv123', nowMs: NOW });
    expect(snap).toBeTruthy();
    expect(snap.liveId).toBe('lv123');
    expect(snap.capturedAt).toBe(NOW);
    expect(snap.recordsText).toBe('81');
    expect(snap.visitor.text).toBe('3,500');
    expect(snap.official.comments.text).toBe('567');
    expect(snap.official.streamAge.isPlaceholder).toBe(false);
    // 帯に通すと「—」でなく数字が付く
    const k = byKey(buildVenueStatStripModel(null, { liveId: 'lv123', nowMs: NOW, selfSnap: snap }));
    expect(k.visitor.text).toBe('3,500');
    expect(k.records.text).toBe('81');
    expect(k.streamAge.text).not.toBe('—');
  });

  it('YouTube 等: 同接は直接値・記録はまとめの件数・同接を「来場」として出さない', () => {
    const snap = buildStatCardsFromWatchSnapshot({ snapshot: ytSnap() }, { liveId: 'lv900000001', nowMs: NOW });
    expect(snap.recordsText).toBe('6,352');
    expect(snap.concurrent.estText).toBe('83,448');
    expect(snap.concurrent.subText).toBe('直接値');
    expect(snap.official.viewers.text).toBe('—');
    expect(snap.official.streamAge.isPlaceholder).toBe(false);
  });

  it('別の配信のスナップショット・壊れた入力は null(取り違えない・落ちない)', () => {
    expect(buildStatCardsFromWatchSnapshot({ snapshot: nicoSnap() }, { liveId: 'lv999', nowMs: NOW })).toBeNull();
    expect(buildStatCardsFromWatchSnapshot(null, { liveId: 'lv123' })).toBeNull();
    expect(buildStatCardsFromWatchSnapshot({ snapshot: 'x' }, { liveId: 'lv123' })).toBeNull();
    expect(buildStatCardsFromWatchSnapshot({ snapshot: {} }, { liveId: 'lv123' })).toBeNull();
    // 数字が1つも無くても落ちずに「—」で返る
    const empty = buildStatCardsFromWatchSnapshot({ snapshot: { liveId: 'lv123' } }, { liveId: 'lv123', nowMs: NOW });
    expect(empty.recordsText).toBe('');
    expect(empty.recordsIsPlaceholder).toBe(true);
  });
});

describe('createVenueStatSelfPoller(重くしない)', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('15秒に1回まで・新しい鏡があるあいだは取りに行かない', async () => {
    const fetchSource = vi.fn(async () => ({ snapshot: nicoSnap() }));
    const onSnap = vi.fn();
    const p = createVenueStatSelfPoller({ fetchSource, onSnap });
    expect(p.tick(NOW, { liveId: 'lv123', mirrorFresh: true })).toBe(false);
    expect(fetchSource).toHaveBeenCalledTimes(0);
    expect(p.tick(NOW, { liveId: 'lv123', mirrorFresh: false, recordedCount: 5 })).toBe(true);
    await flush();
    expect(onSnap).toHaveBeenCalledTimes(1);
    expect(onSnap.mock.calls[0][0].recordsText).toBe('5');
    // 800ms ごとの見回りから何度呼ばれても、間隔内は取りに行かない
    for (let i = 1; i < 18; i += 1) p.tick(NOW + i * 800, { liveId: 'lv123', mirrorFresh: false });
    expect(fetchSource).toHaveBeenCalledTimes(1);
    expect(p.tick(NOW + VENUE_STAT_SELF_INTERVAL_MS, { liveId: 'lv123', mirrorFresh: false })).toBe(true);
    await flush();
    expect(p.diag().runs).toBe(2);
    expect(p.diag().built).toBe(2);
  });

  it('取れなかった(例外・null)とき会場を止めず、次の間隔でまた試す', async () => {
    let n = 0;
    const fetchSource = vi.fn(async () => { n += 1; if (n === 1) throw new Error('x'); return null; });
    const onSnap = vi.fn();
    const p = createVenueStatSelfPoller({ fetchSource, onSnap });
    p.tick(NOW, { liveId: 'lv123', mirrorFresh: false });
    await flush();
    expect(p.diag().failed).toBe(1);
    expect(p.tick(NOW + VENUE_STAT_SELF_INTERVAL_MS, { liveId: 'lv123', mirrorFresh: false })).toBe(true);
    await flush();
    expect(onSnap).not.toHaveBeenCalled();
  });

  it('配信が分からないあいだは取りに行かない', () => {
    const fetchSource = vi.fn();
    const p = createVenueStatSelfPoller({ fetchSource, onSnap: () => {} });
    expect(p.tick(NOW, { liveId: '', mirrorFresh: false })).toBe(false);
    expect(fetchSource).not.toHaveBeenCalled();
  });
});

describe('requestWatchSnapshotViaTabs(別窓の会場)', () => {
  it('その配信の視聴タブにだけ、パネルと同じ問い合わせをする', async () => {
    const sendMessage = vi.fn(async (id) => (id === 7 ? { ok: true, snapshot: nicoSnap() } : { ok: false }));
    const chromeLike = {
      tabs: {
        query: async () => [{ id: 1, url: 'https://example.com/' }, { id: 5, url: 'https://live.nicovideo.jp/watch/lv999' }, { id: 7, url: 'https://live.nicovideo.jp/watch/lv123?ref=x' }, { url: undefined }],
        sendMessage
      }
    };
    const r = await requestWatchSnapshotViaTabs(chromeLike, 'LV123');
    expect(r.snapshot.liveId).toBe('lv123');
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][1]).toEqual({ type: 'NLS_EXPORT_WATCH_SNAPSHOT' });
  });

  it('タブが無い・返事が無い・chrome.tabs が無いときは null', async () => {
    expect(await requestWatchSnapshotViaTabs({ tabs: { query: async () => [], sendMessage: async () => null } }, 'lv123')).toBeNull();
    expect(await requestWatchSnapshotViaTabs({ tabs: { query: async () => [{ id: 3, url: 'https://live.nicovideo.jp/watch/lv123' }], sendMessage: async () => { throw new Error('no receiver'); } } }, 'lv123')).toBeNull();
    expect(await requestWatchSnapshotViaTabs({}, 'lv123')).toBeNull();
  });
});

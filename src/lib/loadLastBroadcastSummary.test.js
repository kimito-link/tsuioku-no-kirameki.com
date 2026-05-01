import { describe, expect, it } from 'vitest';
import {
  buildLastBroadcastReviewView,
  DEFAULT_LAST_BROADCAST_FRESHNESS_MS,
  formatLastBroadcastIndicator,
  loadLastBroadcastSummary
} from './loadLastBroadcastSummary.js';

describe('loadLastBroadcastSummary', () => {
  it('db が無ければ null', async () => {
    expect(await loadLastBroadcastSummary(null)).toBeNull();
    expect(await loadLastBroadcastSummary(undefined)).toBeNull();
  });

  it('DEFAULT_LAST_BROADCAST_FRESHNESS_MS は 30 日 (= 2592000000ms)', () => {
    expect(DEFAULT_LAST_BROADCAST_FRESHNESS_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe('buildLastBroadcastReviewView', () => {
  it('null/undefined/非オブジェクトは null', () => {
    expect(buildLastBroadcastReviewView(null)).toBeNull();
    expect(buildLastBroadcastReviewView(undefined)).toBeNull();
    expect(buildLastBroadcastReviewView('foo')).toBeNull();
  });

  it('liveId が空の row は null', () => {
    expect(
      buildLastBroadcastReviewView({ liveId: '', capturedAt: 1000 })
    ).toBeNull();
    expect(
      buildLastBroadcastReviewView({ liveId: '   ', capturedAt: 1000 })
    ).toBeNull();
  });

  it('capturedAt が無効な row は null', () => {
    expect(
      buildLastBroadcastReviewView({ liveId: 'lv1', capturedAt: 0 })
    ).toBeNull();
    expect(
      buildLastBroadcastReviewView({ liveId: 'lv1', capturedAt: -1 })
    ).toBeNull();
    expect(
      buildLastBroadcastReviewView({ liveId: 'lv1', capturedAt: NaN })
    ).toBeNull();
  });

  it('最低限の row でビューを構築する（フォールバック）', () => {
    const v = buildLastBroadcastReviewView({
      liveId: 'lv99999',
      capturedAt: 1714563000000,
      watchUrl: 'https://live.nicovideo.jp/watch/lv99999',
      commentStorageCount: 14
    });
    expect(v).not.toBeNull();
    expect(v.liveId).toBe('lv99999');
    expect(v.watchUrl).toBe('https://live.nicovideo.jp/watch/lv99999');
    expect(v.commentStorageCount).toBe(14);
    expect(v.peakConcurrentEstimate).toBeNull();
    expect(v.officialCommentCount).toBeNull();
    expect(v.officialViewerCount).toBeNull();
    expect(v.viewerCount).toBeNull();
    expect(v.broadcastTitle).toBeUndefined();
    expect(v.broadcasterName).toBeUndefined();
  });

  it('完全な row はすべて反映される', () => {
    const v = buildLastBroadcastReviewView({
      liveId: 'lv99999',
      capturedAt: 1714563000000,
      watchUrl: 'https://live.nicovideo.jp/watch/lv99999',
      commentStorageCount: 14,
      peakConcurrentEstimate: 37,
      officialCommentCount: 235,
      officialViewerCount: 121,
      viewerCountFromDom: 121,
      broadcastTitle: ' アサイチ プレミアムトーク ',
      broadcasterName: '監督ちゃん',
      broadcasterUserId: '12345',
      broadcasterIconUrl: 'https://example.com/icon.png',
      broadcasterPageUrl: 'https://com.nicovideo.jp/user/12345',
      thumbnailUrl: 'https://example.com/thumb.jpg'
    });
    expect(v.broadcastTitle).toBe('アサイチ プレミアムトーク');
    expect(v.broadcasterName).toBe('監督ちゃん');
    expect(v.broadcasterUserId).toBe('12345');
    expect(v.broadcasterIconUrl).toBe('https://example.com/icon.png');
    expect(v.broadcasterPageUrl).toBe('https://com.nicovideo.jp/user/12345');
    expect(v.thumbnailUrl).toBe('https://example.com/thumb.jpg');
    expect(v.viewerCount).toBe(121);
    expect(v.peakConcurrentEstimate).toBe(37);
    expect(v.officialCommentCount).toBe(235);
    expect(v.officialViewerCount).toBe(121);
  });

  it('viewerCountFromDom=null は viewerCount も null（明示）', () => {
    const v = buildLastBroadcastReviewView({
      liveId: 'lv1',
      capturedAt: 1714563000000,
      viewerCountFromDom: null
    });
    expect(v.viewerCount).toBeNull();
  });

  it('viewerCountFromDom が undefined / 負数 / NaN は viewerCount も null', () => {
    const base = { liveId: 'lv1', capturedAt: 1714563000000 };
    expect(buildLastBroadcastReviewView({ ...base }).viewerCount).toBeNull();
    expect(
      buildLastBroadcastReviewView({ ...base, viewerCountFromDom: -1 })
        .viewerCount
    ).toBeNull();
    expect(
      buildLastBroadcastReviewView({ ...base, viewerCountFromDom: NaN })
        .viewerCount
    ).toBeNull();
  });
});

describe('formatLastBroadcastIndicator', () => {
  // 基準: 2026-05-01 (金) 09:00:00 JST = 2026-04-30T 24:00 UTC ≒ 1746118800000
  const NOW = new Date('2026-05-01T09:00:00').getTime();

  it('capturedAt が無効なら「前回の配信」', () => {
    expect(formatLastBroadcastIndicator(0, NOW)).toBe('前回の配信');
    expect(formatLastBroadcastIndicator(-1, NOW)).toBe('前回の配信');
    expect(formatLastBroadcastIndicator(NaN, NOW)).toBe('前回の配信');
    expect(formatLastBroadcastIndicator('not-number', NOW)).toBe('前回の配信');
  });

  it('当日（同じ日）なら HH:mm 表示', () => {
    const sameDay = new Date('2026-05-01T08:37:00').getTime();
    expect(formatLastBroadcastIndicator(sameDay, NOW)).toBe('前回（08:37 〜）');
  });

  it('7 日以内の別日なら M/D HH:mm 表示', () => {
    const yesterday = new Date('2026-04-30T22:15:00').getTime();
    expect(formatLastBroadcastIndicator(yesterday, NOW)).toBe(
      '前回（4/30 22:15 〜）'
    );
    const sixDaysAgo = new Date('2026-04-25T10:00:00').getTime();
    expect(formatLastBroadcastIndicator(sixDaysAgo, NOW)).toBe(
      '前回（4/25 10:00 〜）'
    );
  });

  it('7 日以上前なら YYYY/M/D 表示', () => {
    const tenDaysAgo = new Date('2026-04-21T10:00:00').getTime();
    expect(formatLastBroadcastIndicator(tenDaysAgo, NOW)).toBe(
      '前回（2026/4/21 〜）'
    );
  });

  it('nowMs を省略すると Date.now() を使う（smoke）', () => {
    const result = formatLastBroadcastIndicator(Date.now() - 1000);
    expect(result).toMatch(/^前回（/);
  });
});

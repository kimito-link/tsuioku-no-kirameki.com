import { describe, it, expect } from 'vitest';
import { buildYtVideoWatchCardModel, ytVideoWatchCardInnerHtml, YT_VIDEO_WATCH_CARD_TITLE } from './ytVideoWatchCard.js';
import {
  estimateYoutubeSupportSpendJpy,
  estimateStreamerTakeHomeJpy,
  formatEstimatedViewerSpendDisplay,
  formatStreamerTakeHomeDisplay,
} from '../estimatedViewerSpend.js';

const A = 'UCabcdefghijklmnopqrstuv';

describe('buildYtVideoWatchCardModel', () => {
  it('再生・記録・交差の文言を、数字があるときと無いときで取り違えない', () => {
    const empty = buildYtVideoWatchCardModel({ videoId: 'abcdefghijk' });
    expect(empty.viewCountText).toBe('—');
    // v0.1.2263: 動画ページで「まだ記録していません」と否定から入らない(記録が無ければ何も出さない)
    expect(empty.recordedSummary).toBe('');
    expect(empty.matchSummary).not.toMatch(/まだ記録|記録していません|記録があると/);

    const full = buildYtVideoWatchCardModel({
      videoId: 'abcdefghijk',
      viewCount: 12345,
      recorded: { streamCount: 2, itemCount: 30 },
      videoAuthors: [
        { channelId: A, name: '花子', amount: 500, currency: 'JPY', handle: '' },
        { channelId: 'UCdddddddddddddddddddddd', name: '動画だけ', amount: null, currency: '', handle: '' },
      ],
      livePeople: { [A]: { n: '花子', c: 4, t: 1 } },
    });
    expect(full.viewCountText).toBe('12,345 回');
    expect(full.recordedSummary).toContain('2 本');
    expect(full.recordedSummary).toContain('30 件');
    expect(full.matchedCount).toBe(1);
    expect(full.matchedNames).toEqual(['花子']);
    expect(full.superThanksCount).toBe(1);
    expect(full.matchSummary).toContain('2 人のうち、1 人');
  });
});

describe('ytVideoWatchCardInnerHtml', () => {
  it('見出しと再生と名前を出し、HTML は逃がす。禁止ワードは使わない', () => {
    const html = ytVideoWatchCardInnerHtml(
      buildYtVideoWatchCardModel({
        videoId: 'abcdefghijk',
        viewCount: 10,
        recorded: { streamCount: 1, itemCount: 2 },
        videoAuthors: [{ channelId: A, name: '<script>', amount: null, currency: '', handle: '' }],
        livePeople: { [A]: { n: '<script>', c: 1, t: 1 } },
      }),
    );
    expect(html).toContain(YT_VIDEO_WATCH_CARD_TITLE);
    expect(html).toContain('10 回');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toMatch(/有料|LINE|紹介/);
  });
  it('モデルが無ければ空', () => {
    expect(ytVideoWatchCardInnerHtml(null)).toBe('');
  });
});

describe('スーパーサンクスの推定', () => {
  it('金額があるとき、視聴者の購入額と配信者の受取（70%）を出す', () => {
    const amounts = { JPY: 500 };
    const html = ytVideoWatchCardInnerHtml(
      buildYtVideoWatchCardModel({
        videoId: 'abcdefghijk',
        viewCount: 10,
        recorded: { streamCount: 1, itemCount: 1 },
        videoAuthors: [{ channelId: A, name: '花子', amount: 500, currency: 'JPY', handle: '' }],
        livePeople: { [A]: { n: '花子', c: 1, t: 1 } },
        spend: formatEstimatedViewerSpendDisplay(estimateYoutubeSupportSpendJpy(amounts)),
        takeHome: formatStreamerTakeHomeDisplay('youtube', estimateStreamerTakeHomeJpy('youtube', { amounts })),
      }),
    );
    expect(html).toContain('約¥500');
    expect(html).toContain('約¥350');
    expect(html).not.toMatch(/推定（配信者の受取） —</);
  });
});

describe('視聴者の行動を最初に出す', () => {
  it('カードの先頭はコメントした人の列で、なじみと初めてはモデルに残る（要約板は常時出さない）', () => {
    const model = buildYtVideoWatchCardModel({
      videoId: 'abcdefghijk',
      viewCount: 10,
      recorded: { streamCount: 2, itemCount: 8 },
      videoAuthors: [
        { channelId: A, name: '花子', amount: null, currency: '', handle: '' },
        { channelId: 'UCdddddddddddddddddddddd', name: '新しい人', amount: null, currency: '', handle: '' },
      ],
      livePeople: { [A]: { n: '花子', c: 4, t: 1, f: 1, lv: 2, seenLive: true } },
    });
    const html = ytVideoWatchCardInnerHtml(model);
    expect(html).not.toContain('視聴者の行動');
    expect(html.indexOf('data-live-lane-host')).toBeLessThan(html.indexOf('nlsb-video-watch-card__title'));
    expect(model.behavior.rows.some((r) => r.name === '花子' && r.relationLabel === 'なじみ')).toBe(true);
    expect(model.behavior.rows.some((r) => r.name === '新しい人' && r.relationLabel === '初めて')).toBe(true);
  });
});

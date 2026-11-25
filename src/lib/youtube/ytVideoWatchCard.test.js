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
    expect(empty.recordedSummary).toContain('まだ記録していません');
    expect(empty.matchSummary).toContain('配信の記録があると');

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

import { describe, it, expect } from 'vitest';
import { VIEWER_BEHAVIOR_TITLE } from '../viewerBehavior.js';
import { buildNicoVideoWatchCardModel, nicoVideoWatchCardInnerHtml, NICO_VIDEO_WATCH_CARD_TITLE } from './nicoVideoWatchCard.js';

describe('buildNicoVideoWatchCardModel', () => {
  it('視聴者の行動を先に出し、再生数と記録を取り違えない', () => {
    const model = buildNicoVideoWatchCardModel({
      videoId: 'sm9',
      title: '題',
      viewCount: 23142299,
      ownerId: '4',
      recorded: { streamCount: 2, itemCount: 30 },
      videoAuthors: [
        { userId: '123', name: '花子', commentCount: 2 },
        { userId: '456', name: '動画だけ', commentCount: 1 },
      ],
      livePeople: { 123: { n: '花子', c: 8, t: 1, lv: 3, seenLive: true } },
      historyReady: true,
    });
    expect(model.viewCountText).toBe('23,142,299 回');
    expect(model.behavior.regularCount).toBe(1);
    expect(model.behavior.newCount).toBe(1);
    const html = nicoVideoWatchCardInnerHtml(model);
    expect(html.indexOf('nlsb-viewer-behavior')).toBeLessThan(html.indexOf('nlsb-video-watch-card__title'));
    expect(html.indexOf(VIEWER_BEHAVIOR_TITLE)).toBeLessThan(html.indexOf('23,142,299 回'));
    expect(html).toContain('なじみ');
    expect(html).toContain('花子');
    expect(html).not.toMatch(/有料|LINE|紹介/);
  });

  it('モデルが無ければ空', () => {
    expect(nicoVideoWatchCardInnerHtml(null)).toBe('');
  });
});

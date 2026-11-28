import { describe, expect, it } from 'vitest';
import { normalizeVideoFacts } from './videoFacts.js';
import { readVodWatchDom } from './vodCommentsFromDom.js';

const services = ['niconico', 'youtube', 'twitch', 'kick', 'twitcasting', 'showroom', 'mixch', 'tiktok', 'whowatch', 'abema'];
const inputs = [[null, null], [undefined, null], ['', null], [' ', null], [false, null], [0, 0], ['0', 0], [12, 12]];
describe.each(services)('%s video facts', () => {
  it.each(inputs)('normalizes %s to %s', (input, expected) => {
    expect(normalizeVideoFacts({ likes: input, commentTotal: input })).toMatchObject({
      likes: expected, commentTotal: expected,
    });
  });
});

it.each(['twitch', 'kick', 'tiktok', 'abema'])('%s preserves missing playback data and real zero', (platform) => {
  for (const [input, expected] of inputs) {
    const video = { '@type': 'VideoObject', interactionStatistic: [
      { interactionType: 'LikeAction', userInteractionCount: 100 },
      { interactionType: 'WatchAction', userInteractionCount: input },
    ] };
    const stats = { diggCount: input, commentCount: input };
    const hydration = { __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct: { id: '123456', stats } } } } };
    const doc = /** @type {Document} */ (/** @type {unknown} */ ({
      title: 'Synthetic',
      querySelector: (selector) => selector.includes('UNIVERSAL') ? { textContent: JSON.stringify(hydration) } : null,
      querySelectorAll: (selector) => selector.includes('ld+json') ? [{ textContent: JSON.stringify(video) }] : [],
    }));
    const result = readVodWatchDom(doc, { platform, videoId: '123456' });
    expect(result.viewCount).toBe(expected);
    if (platform === 'tiktok') {
      expect(result.facts?.likes ?? null).toBe(expected);
      expect(result.facts?.commentTotal ?? null).toBe(expected);
    }
  }
});

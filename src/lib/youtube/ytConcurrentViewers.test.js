import { describe, expect, it } from 'vitest';
import {
  concurrentViewersFromPageHtml,
  concurrentViewersFromUpdatedMetadata,
} from './ytConcurrentViewers.js';

const VID = 'abcdefghijk';
const OTHER = 'zzzzzzzzzzz';

const initial = {
  currentVideoEndpoint: { watchEndpoint: { videoId: VID } },
  contents: {
    twoColumnWatchNextResults: {
      results: {
        results: {
          contents: [
            {
              videoPrimaryInfoRenderer: {
                viewCount: {
                  videoViewCountRenderer: {
                    originalViewCount: '4321',
                    viewCount: { simpleText: '4,321 人が視聴中' },
                    isLive: true,
                  },
                },
              },
            },
          ],
        },
      },
    },
  },
};

describe('concurrentViewersFromPageHtml', () => {
  it('画面の文字が無く、ytInitialData の中だけに数があるページから同時視聴者数を取る', () => {
    const html = `<!doctype html><html><head><title>配信</title></head><body><h1>配信</h1><script>var ytInitialData = ${JSON.stringify(initial)};</script></body></html>`;
    expect(html.includes('人が視聴中')).toBe(true);
    expect(html.replace(/<script[\s\S]*<\/script>/g, '').includes('人が視聴中')).toBe(false);
    expect(concurrentViewersFromPageHtml(html)).toBe(4321);
  });

  it('別の動画の updated_metadata は使わない', () => {
    const body = {
      videoId: OTHER,
      viewCount: {
        videoViewCountRenderer: {
          isLive: true,
          originalViewCount: '99',
          viewCount: { simpleText: '99 人が視聴中' },
        },
      },
    };
    expect(concurrentViewersFromUpdatedMetadata(body, VID)).toBe(null);
    expect(concurrentViewersFromUpdatedMetadata({ ...body, videoId: VID }, VID)).toBe(99);
  });
});

import { describe, it, expect } from 'vitest';
import { Window } from 'happy-dom';
import { concurrentViewersInInnertube } from './ytConcurrentViewers.js';
import { mergeYtStreamSummary } from './ytStreamStorePolicy.js';
import {
  classifyYtWatchContentKind,
  ytViewCountFromDom,
  ytCommentCountFromDom,
  ytVideoCommentAuthorsFromDom,
} from './ytVideoWatchMeta.js';
import { parseYtVideoIdFromUrl } from './ytPageMeta.js';

const VOD = 'SIk45QZsnDM';
const MIX_LIVE = 'dQw4w9WgXcQ';

const mixInnertube = {
  currentVideoEndpoint: { watchEndpoint: { videoId: VOD } },
  contents: {
    twoColumnWatchNextResults: {
      results: {
        results: {
          contents: [
            {
              videoPrimaryInfoRenderer: {
                viewCount: {
                  videoViewCountRenderer: {
                    viewCount: { simpleText: '12,345 回視聴' },
                    isLive: false,
                  },
                },
              },
            },
          ],
        },
      },
      playlist: {
        playlist: {
          contents: [
            {
              playlistPanelVideoRenderer: {
                navigationEndpoint: { watchEndpoint: { videoId: MIX_LIVE } },
                title: { simpleText: '別の配信' },
                videoViewCountRenderer: {
                  viewCount: { simpleText: '1,190人が視聴中' },
                  isLive: true,
                },
              },
            },
          ],
        },
      },
    },
  },
};

function vodDom() {
  const win = new Window({ url: `https://www.youtube.com/watch?v=${VOD}&list=RD${VOD}&start_radio=1` });
  const doc = win.document;
  doc.documentElement.setAttribute('data-nl-yt-is-live', '0');
  doc.documentElement.setAttribute('data-nl-yt-is-live-content', '0');
  doc.body.innerHTML = `
    <ytd-watch-info-text>
      <yt-formatted-string>12,345 回視聴</yt-formatted-string>
    </ytd-watch-info-text>
    <ytd-playlist-panel-renderer id="playlist">
      <span>1,190 人が視聴中</span>
    </ytd-playlist-panel-renderer>
    <ytd-comments-header-renderer>
      <div id="count">125 件のコメント</div>
    </ytd-comments-header-renderer>
    <ytd-comment-view-model comment-id="UgxdAAA">
      <a href="/channel/UCaaaaaaaaaaaaaaaaaaaaaa">花子</a>
      <yt-img-shadow><img src="https://yt3.ggpht.com/hanako.jpg" alt=""></yt-img-shadow>
      <yt-attributed-string id="name">花子</yt-attributed-string>
      <div id="creator-heart"></div>
    </ytd-comment-view-model>
    <ytd-comment-view-model comment-id="UgxdBBB">
      <a href="/channel/UCbbbbbbbbbbbbbbbbbbbbbb">新しい人</a>
      <yt-img-shadow><img src="https://yt3.ggpht.com/new.jpg" alt=""></yt-img-shadow>
      <yt-attributed-string id="name">新しい人</yt-attributed-string>
      <div class="super-thanks">¥500</div>
    </ytd-comment-view-model>
  `;
  return doc;
}

describe('通常動画の取り違えを直す (0.1.2234)', () => {
  it('list= と start_radio が付いていても動画IDは v= を取る', () => {
    expect(parseYtVideoIdFromUrl(`https://www.youtube.com/watch?v=${VOD}&list=RD${VOD}&start_radio=1`)).toBe(VOD);
  });

  it('公式が配信ではないとき、横の Mix の同時視聴者数があっても通常動画にする', () => {
    expect(
      classifyYtWatchContentKind({
        url: `https://www.youtube.com/watch?v=${VOD}&list=RD${VOD}&start_radio=1`,
        concurrentViewers: 1190,
        isLive: false,
        isLiveContent: false,
      }),
    ).toBe('video');
  });

  it('Mix 欄の「1,190人が視聴中」を、開いている通常動画の同時視聴者数にしない', () => {
    expect(concurrentViewersInInnertube(mixInnertube, VOD)).toBeNull();
    expect(concurrentViewersInInnertube(mixInnertube, MIX_LIVE)).toBe(1190);
  });

  it('一度 live と取り違えても、公式の通常動画の印で直し、同時視聴者数は残さない', () => {
    const first = mergeYtStreamSummary(undefined, {
      videoId: VOD,
      contentKind: 'live',
      concurrentViewers: 1190,
    }, 1);
    expect(first.contentKind).toBe('live');
    expect(first.concurrentViewers).toBe(1190);
    const fixed = mergeYtStreamSummary(first, {
      videoId: VOD,
      contentKind: 'video',
      isLive: false,
      isLiveContent: false,
      slotViewCount: 12345,
      slotCommentCount: 125,
    }, 2);
    expect(fixed.contentKind).toBe('video');
    expect(fixed.concurrentViewers).toBeNull();
    expect(fixed.slotViewCount).toBe(12345);
    expect(fixed.slotCommentCount).toBe(125);
  });
});

describe('2026 の通常動画 DOM から再生数・コメント・未対応を読む', () => {
  it('再生数とコメント件数を取り、運営のハートが無いコメントだけ未対応にする', () => {
    const doc = vodDom();
    expect(ytViewCountFromDom(doc)).toBe(12345);
    expect(ytCommentCountFromDom(doc)).toBe(125);
    const authors = ytVideoCommentAuthorsFromDom(doc);
    expect(authors).toHaveLength(2);
    const hanako = authors.find((a) => a.channelId === 'UCaaaaaaaaaaaaaaaaaaaaaa');
    const newbie = authors.find((a) => a.channelId === 'UCbbbbbbbbbbbbbbbbbbbbbb');
    expect(hanako?.creatorHeart).toBe(true);
    expect(hanako?.pending).toBe(false);
    expect(hanako?.avatarUrl).toContain('hanako.jpg');
    expect(newbie?.pending).toBe(true);
    expect(newbie?.amount).toBe(500);
    expect(newbie?.currency).toBe('JPY');
    expect(newbie?.commentId).toBe('UgxdBBB');
  });
});

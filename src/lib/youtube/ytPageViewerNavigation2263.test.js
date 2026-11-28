// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import * as meta from './ytVideoWatchMeta.js';
import { startYtPageViewerReader } from './ytPageViewerReader.js';

it('mix navigation uses the matching player and page data independently', async () => {
  const root = document.documentElement;
  const page = (videoId) => ({ currentVideoEndpoint: { watchEndpoint: { videoId } } });
  const player = (videoId, likes) => ({
    videoDetails: { videoId, isLive: false, isLiveContent: false },
    microformat: { playerMicroformatRenderer: { likeCount: likes } },
  });
  const move = async (id, response) => {
    history.pushState(null, '', '/watch?v=' + id + '&list=RDAAAAAAAAAAA');
    window.dispatchEvent(new CustomEvent('yt-navigate-finish', { detail: { response } }));
    await new Promise((resolve) => setTimeout(resolve, 5));
  };
  history.replaceState(null, '', '/watch?v=AAAAAAAAAAA');
  const w = /** @type {any} */ (window);
  w.ytInitialData = page('AAAAAAAAAAA');
  w.ytInitialPlayerResponse = player('AAAAAAAAAAA', 8);
  const script = document.createElement('script');
  script.textContent = 'var ytInitialData = ' + JSON.stringify(page('AAAAAAAAAAA')) + ';';
  document.head.append(script);
  startYtPageViewerReader();

  await move('BBBBBBBBBBB', { playerResponse: player('BBBBBBBBBBB', 17) });
  expect(root.getAttribute('data-nl-yt-kind-video-id')).toBe('BBBBBBBBBBB');
  expect(root.getAttribute('data-nl-yt-content-kind')).toBe('video');
  expect(root.getAttribute('data-nl-yt-like-count')).toBe('17');

  await move('CCCCCCCCCCC', { response: { ...page('CCCCCCCCCCC'), videoDetails: { isLive: false, isLiveContent: false } } });
  expect(root.getAttribute('data-nl-yt-kind-video-id')).toBe('CCCCCCCCCCC');
  expect(root.getAttribute('data-nl-yt-content-kind')).toBe('video');
  expect(root.hasAttribute('data-nl-yt-like-count')).toBe(false);

  await move('DDDDDDDDDDD', { response: page('DDDDDDDDDDD'), playerResponse: player('DDDDDDDDDDD', 21) });
  expect(root.getAttribute('data-nl-yt-kind-video-id')).toBe('DDDDDDDDDDD');
  expect(root.getAttribute('data-nl-yt-like-count')).toBe('21');
});

it('official ordinary video flags beat a stale replay frame', () => {
  expect(meta.classifyYtWatchContentKind({
    isLive: false, isLiveContent: false, hasLiveChatReplay: true,
  })).toBe('video');
});

it('reads only the current video replay frame and tagged view count', () => {
  const doc = document.implementation.createHTMLDocument('');
  const id = 'BBBBBBBBBBB';
  const root = doc.documentElement;
  root.setAttribute('data-nl-yt-view-count', '1234');
  root.setAttribute('data-nl-yt-view-count-video-id', 'AAAAAAAAAAA');
  let src = '/live_chat_replay?v=AAAAAAAAAAA';
  const query = doc.querySelectorAll.bind(doc);
  const fixture = /** @type {Document} */ (/** @type {unknown} */ ({
    documentElement: root,
    querySelectorAll: (selector) => selector === 'iframe[src]' ? [{ getAttribute: () => src }] : query(selector),
    querySelector: doc.querySelector.bind(doc),
  }));

  expect(meta.readYtWatchIndicators(fixture, id)).toEqual({ viewCount: null, hasLiveChat: false, hasLiveChatReplay: false });
  root.setAttribute('data-nl-yt-view-count-video-id', id);
  src = '/live_chat_replay?v=' + id;
  expect(meta.readYtWatchIndicators(fixture, id)).toEqual({ viewCount: 1234, hasLiveChat: false, hasLiveChatReplay: true });
});

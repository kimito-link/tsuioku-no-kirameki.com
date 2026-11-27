import { Window } from 'happy-dom';
import { expect, it, vi } from 'vitest';
import { resolveViewerBehaviorAvatarUrl } from '../lib/viewerBehavior.js';
import { KEY_YT_VIDEO_WATCH_CARD } from '../lib/storageKeys.js';
import { buildYtVideoWatchCardModel } from '../lib/youtube/ytVideoWatchCard.js';
import { wireVideoLanePersonDetail } from './wireVideoLanePersonDetail.js';
import { applyVideoWatchRootMark, installViewerBehaviorBoardFromStorage } from './viewerBehaviorBoardPaint.js';
import { wirePanelVoiceReadingButton } from './popup/wirePanelVoiceReadingButton.js';

it('keeps numeric IDs inside their own service and replaces default silhouettes', () => {
  const nico = resolveViewerBehaviorAvatarUrl('81234567', '', 'niconico');
  expect(nico).toContain('/81234567.jpg');
  for (const service of ['youtube', 'twitch', 'kick', 'twitcasting', 'showroom', 'mixch', 'tiktok', 'whowatch', 'abema']) {
    expect(resolveViewerBehaviorAvatarUrl('81234567', '', service)).toMatch(/^data:image\//);
    expect(resolveViewerBehaviorAvatarUrl('@same', 'https://example.invalid/usericon/defaults/blank_s.jpg', service)).toMatch(/^data:image\//);
  }
});

it('replaces a broken reply image with an accessible neutral placeholder', () => {
  const win = new Window();
  const doc = win.document;
  const box = doc.createElement('section');
  const img = doc.createElement('img');
  img.className = 'nlsb-person-detail__reply-face';
  box.append(img);
  wireVideoLanePersonDetail(box, { document: doc });
  img.dispatchEvent(new win.Event('error', { bubbles: true }));
  expect(box.querySelector('img')).toBeNull();
  expect(box.querySelector('[aria-hidden="true"]')).not.toBeNull();
});

it('blocks reading activation in video, including an already queued click, and restores it on live', () => {
  const win = new Window();
  const doc = win.document;
  const button = doc.createElement('button');
  button.id = 'openComeviewVoiceBtn';
  doc.body.append(button);
  /** @type {Function[]} */
  const reads = [];
  const set = vi.fn();
  vi.stubGlobal('chrome', { runtime: {}, storage: {
    local: { get: (_keys, cb) => reads.push(cb), set },
    onChanged: { addListener() {} },
  } });
  try {
    wirePanelVoiceReadingButton((id) => doc.getElementById(id));
    reads.shift()({});
    button.click();
    const pending = reads.shift();
    applyVideoWatchRootMark(doc, true, 'youtube-video');
    pending({});
    expect(set).not.toHaveBeenCalled();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    button.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    expect(reads).toHaveLength(0);
    applyVideoWatchRootMark(doc, false);
    expect(button.disabled).toBe(false);
    button.click();
    reads.shift()({});
    expect(set).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('returning from a video to live removes the popup video card even when the last watch URL is stale', async () => {
  const win = new Window();
  const doc = win.document;
  const id = 'AAAAAAAAAAA';
  const video = 'https://www.youtube.com/watch?v=' + id;
  const live = 'https://live.nicovideo.jp/watch/lv123456789';
  const bag = { [KEY_YT_VIDEO_WATCH_CARD]: { videoId: id, card: buildYtVideoWatchCardModel({ videoId: id, title: 'Synthetic', viewCount: 10 }) } };
  const ui = installViewerBehaviorBoardFromStorage({
    document: doc, getUrl: () => video, mountParent: doc.body,
    storage: { local: { get: async () => bag } },
  });
  ui.notePageTab({ id: 1, url: video });
  await Promise.resolve();
  expect(doc.documentElement.getAttribute('data-nl-video-watch')).toBe('1');
  expect(doc.querySelector('.nlsb-video-watch-card')).not.toBeNull();

  ui.notePageTab({ id: 2, url: live });
  await Promise.resolve();
  expect(doc.documentElement.hasAttribute('data-nl-video-watch')).toBe(false);
  expect(doc.querySelector('.nlsb-video-watch-card')).toBeNull();
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { YT_LAST_STREAM_URL_KEY } from '../../extension-youtube/src/pfLastStreamUrl.js';
import {
  OBS_NICO_COMEVIEW_PAGE,
  OBS_SERVICE_COMEVIEW_PAGE,
  OBS_YT_LAST_STREAM_URL_KEY,
  obsComeviewTargetForWatchUrl,
  pickObsComeviewWatch
} from './obsComeviewPage.js';

describe('OBS透過窓のコメビュ', () => {
  it('配信の URL ごとに、コメントが入っているページを選ぶ', () => {
    expect(obsComeviewTargetForWatchUrl('https://live.nicovideo.jp/watch/lv349100001')?.page).toBe(OBS_NICO_COMEVIEW_PAGE);
    expect(obsComeviewTargetForWatchUrl('https://www.youtube.com/watch?v=abcdefghijk')?.page).toBe(OBS_SERVICE_COMEVIEW_PAGE);
    expect(obsComeviewTargetForWatchUrl('https://www.youtube.com/live/abcdefghijk')?.serviceId).toBe('youtube');
    expect(obsComeviewTargetForWatchUrl('https://www.twitch.tv/examplechan')?.page).toBe(OBS_SERVICE_COMEVIEW_PAGE);
    expect(obsComeviewTargetForWatchUrl('https://kick.com/example')?.serviceId).toBe('kick');
    expect(obsComeviewTargetForWatchUrl('https://whowatch.tv/viewer/12345')?.serviceId).toBe('whowatch');
    expect(obsComeviewTargetForWatchUrl('https://www.showroom-live.com/r/example')?.serviceId).toBe('showroom');
    expect(obsComeviewTargetForWatchUrl('https://mixch.tv/u/123/live')?.serviceId).toBe('mixch');
    expect(obsComeviewTargetForWatchUrl('https://www.tiktok.com/@example/live')?.serviceId).toBe('tiktok');
    expect(obsComeviewTargetForWatchUrl('https://www.nicovideo.jp/') ).toBeNull();
    expect(obsComeviewTargetForWatchUrl('https://www.twitch.tv/directory')).toBeNull();
  });

  it('YouTube をあとから見ていたら、古いニコ生タブより YouTube のコメビュを開く', () => {
    const pick = pickObsComeviewWatch({
      tabs: [
        { url: 'https://live.nicovideo.jp/watch/lv1', lastAccessed: 10 },
        { url: 'https://www.youtube.com/watch?v=abcdefghijk', lastAccessed: 20 }
      ],
      nicoWatchUrl: 'https://live.nicovideo.jp/watch/lv999'
    });
    expect(pick.page).toBe('yt-comeview.html');
    expect(pick.serviceId).toBe('youtube');
    expect(pick.url).toContain('abcdefghijk');
  });

  it('Twitch を見ているときは、そのコメントが入っているコメビュを開く', () => {
    const pick = pickObsComeviewWatch({
      tabs: [{ url: 'https://www.twitch.tv/examplechan', lastAccessed: 5 }]
    });
    expect(pick).toMatchObject({ page: 'yt-comeview.html', serviceId: 'twitch', serviceName: 'Twitch' });
  });

  it('タブが無いときは、保存した視聴 URL を使う', () => {
    expect(pickObsComeviewWatch({
      nicoWatchUrl: 'https://live.nicovideo.jp/watch/lv42',
      ytLast: { url: 'https://www.youtube.com/watch?v=abcdefghijk', at: 9 }
    }).page).toBe('comeview.html');
    expect(pickObsComeviewWatch({
      ytLast: { url: 'https://kick.com/example', key: 'kk.example.1', at: 9 }
    })).toMatchObject({ page: 'yt-comeview.html', serviceId: 'kick' });
    expect(pickObsComeviewWatch({}).page).toBe('comeview.html');
  });

  it('最後に見た配信のキー名は、配信ページが書くキーと同じ', () => {
    expect(OBS_YT_LAST_STREAM_URL_KEY).toBe(YT_LAST_STREAM_URL_KEY);
  });

  it('コピーと透過窓は、選んだページの URL を使う', () => {
    const entry = readFileSync(new URL('../extension/obs-style-entry.js', import.meta.url), 'utf8');
    expect(entry).toContain('pickObsComeviewWatch');
    expect(entry).not.toContain("getURL('comeview.html')");
    expect(entry).toContain('currentWatch.page');
  });
});

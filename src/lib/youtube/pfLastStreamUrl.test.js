import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createLastStreamUrlRemember, REMEMBER_DELAY_MS } from '../../../extension-youtube/src/pfLastStreamUrl.js';

// 0.1.1948: 配信ページが「最後に見た配信」を自分で記録する(ニコ生版 rememberWatchPageUrl の写し・SPEC §4-C1)
function harness(start = 'https://kick.com/a') {
  let url = start;
  let alive = true;
  /** @type {Array<() => void>} */
  const timers = [];
  /** @type {any[]} */
  const writes = [];
  const r = createLastStreamUrlRemember({
    getUrl: () => url,
    getKey: (u) => (/kick\.com\/(\w+)/.exec(u) ? `kk.${/kick\.com\/(\w+)/.exec(u)?.[1]}.1` : ''),
    isAlive: () => alive,
    write: (v) => writes.push(v),
    now: () => 5,
    setTimer: (fn, ms) => {
      expect(ms).toBe(REMEMBER_DELAY_MS);
      timers.push(fn);
      return timers.length;
    },
    clearTimer: (t) => {
      timers[t - 1] = () => {};
    },
  });
  return {
    r,
    writes,
    flush: () => timers.splice(0).forEach((f) => f()),
    setUrl: (/** @type {string} */ u) => (url = u),
    kill: () => (alive = false),
  };
}

describe('pfLastStreamUrl', () => {
  it('配信ページの URL を {url,key,at} で書く', () => {
    const h = harness();
    h.r.remember(false);
    h.flush();
    expect(h.writes).toEqual([{ url: 'https://kick.com/a', key: 'kk.a.1', at: 5 }]);
  });

  it('同じ URL は書き直さない・前面に来たとき(force)は書き直す', () => {
    const h = harness();
    h.r.remember(false);
    h.flush();
    h.r.remember(false);
    h.flush();
    expect(h.writes.length).toBe(1);
    h.r.remember(true);
    h.flush();
    expect(h.writes.length).toBe(2);
  });

  it('続けて変わったら最後の1回だけ書く', () => {
    const h = harness();
    h.r.remember(false);
    h.setUrl('https://kick.com/b');
    h.r.remember(false);
    h.flush();
    expect(h.writes.map((w) => w.key)).toEqual(['kk.b.1']);
  });

  it('配信のページでない・拡張が切れているときは書かない', () => {
    const h = harness('https://example.com/');
    h.r.remember(true);
    h.flush();
    expect(h.writes).toEqual([]);
    const h2 = harness();
    h2.kill();
    h2.r.remember(true);
    h2.flush();
    expect(h2.writes).toEqual([]);
  });
});

describe('配線: shim は「最後に見た配信」を翻訳するだけ(SPEC §4-C2)', () => {
  const shim = readFileSync(new URL('../../../extension-youtube/src/ytNicoShim.js', import.meta.url), 'utf8');
  const venue = readFileSync(new URL('../../../extension-youtube/src/venue-inline-entry.js', import.meta.url), 'utf8');
  const manifest = JSON.parse(readFileSync(new URL('../../../extension/manifest.json', import.meta.url), 'utf8'));
  it('記録の更新で「最後に見た配信」を知らせない(newestVideoIdOf(next) の知らせが無い)', () => {
    expect(shim).not.toMatch(/newestVideoIdOf\(next\)/);
    expect(shim).toContain("announceLastWatch(lvOfLastStream(lastStreamValue), 'page')");
    expect(shim).toContain("announceLastWatch(lvOfLastStream(lastStreamValue), 'resolve')");
  });
  it('popup の疑似 lv の書き込みを yt_last_stream_url へ向け直す', () => {
    expect(shim).toContain('items[YT_LAST_STREAM_URL_KEY] = lastStreamValue');
  });
  it('7サービスの配信ページすべてに書き手(venue-inline)が入っている', () => {
    expect(venue).toContain('installLastStreamUrlRemember(');
    const boot = readFileSync(new URL('../../../src/extension/yt-page-boot.js', import.meta.url), 'utf8');
    expect(boot).toContain("file: 'dist/yt-venue-inline.js'");
    const hosts = ['www.youtube.com', 'www.twitch.tv', 'kick.com', 'whowatch.tv', 'www.showroom-live.com', 'mixch.tv', 'www.tiktok.com'];
    for (const h of hosts) {
      const cs = manifest.content_scripts.find((/** @type {any} */ c) => c.matches.some((/** @type {string} */ m) => m.includes(`//${h}/`)) && (c.js.includes('dist/yt-page-boot.js') || c.js.includes('dist/yt-venue-inline.js')));
      expect(cs, h).toBeTruthy();
    }
  });
});

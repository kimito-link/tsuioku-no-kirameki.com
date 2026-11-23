import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = dirname(fileURLToPath(import.meta.url));
const venueInline = readFileSync(join(root, '../../extension-youtube/src/venue-inline-entry.js'), 'utf8');
const overlayPrep = readFileSync(join(root, '../../extension-youtube/src/ytVenueOverlayPrep.js'), 'utf8');
const twEntry = readFileSync(join(root, '../../extension-youtube/src/tw-content-entry.js'), 'utf8');
const kickEntry = readFileSync(join(root, '../../extension-youtube/src/kick-content-entry.js'), 'utf8');
const mxEntry = readFileSync(join(root, '../../extension-youtube/src/mx-content-entry.js'), 'utf8');
const srEntry = readFileSync(join(root, '../../extension-youtube/src/sr-content-entry.js'), 'utf8');
const wwEntry = readFileSync(join(root, '../../extension-youtube/src/ww-content-entry.js'), 'utf8');
const tcEntry = readFileSync(join(root, '../../extension-youtube/src/tc-content-entry.js'), 'utf8');
const ttEntry = readFileSync(join(root, '../../extension-youtube/src/tt-content-entry.js'), 'utf8');
const abEntry = readFileSync(join(root, '../../extension-youtube/src/ab-content-entry.js'), 'utf8');

describe('P0-1: ページ監視スケジューラの各入口への配線', () => {
  it('venue-inline-entry.js は pageWatchScheduler と venuePaintSchedule.isVenuePageHidden を使い、裸の 1s setInterval を持たない', () => {
    expect(venueInline).toContain("from '../../src/lib/pageWatchScheduler.js'");
    expect(venueInline).toContain("from '../../src/lib/venuePaintSchedule.js'");
    expect(venueInline).toContain('createPageWatchScheduler');
    expect(venueInline).toContain('isVenuePageHidden');
    expect(venueInline).not.toMatch(/setInterval\(\s*sync\s*,\s*1000\s*\)/);
  });

  it('ytVenueOverlayPrep.js は pageWatchScheduler で裏タブ停止し、button 書き換えを 1 回に抑える', () => {
    expect(overlayPrep).toContain("from '../../src/lib/pageWatchScheduler.js'");
    expect(overlayPrep).toContain("from '../../src/lib/venuePaintSchedule.js'");
    expect(overlayPrep).toContain("hiddenMode: 'pause'");
    expect(overlayPrep).toContain('closeLabelPatched');
    expect(overlayPrep).not.toMatch(/setInterval\(/);
  });

  it('tw-content-entry.js は URL 監視と視聴者数ポーリングを 1 本の pageWatchScheduler へ統合している', () => {
    expect(twEntry).toContain("from '../../src/lib/pageWatchScheduler.js'");
    expect(twEntry).toContain("from '../../src/lib/venuePaintSchedule.js'");
    expect(twEntry).toContain("id: 'tw-watch'");
    expect(twEntry).toContain("id: 'tw-viewers'");
    expect(twEntry).toContain("hiddenMode: 'throttle'");
  });

  it('kick-content-entry.js は URL 監視を pageWatchScheduler へ移行している', () => {
    expect(kickEntry).toContain("from '../../src/lib/pageWatchScheduler.js'");
    expect(kickEntry).toContain("from '../../src/lib/venuePaintSchedule.js'");
    expect(kickEntry).toContain("id: 'kick-watch'");
    expect(kickEntry).toContain("hiddenMode: 'throttle'");
  });

  it('全 10 入口とも bfcache 復元（pageshow の persisted）で start()/kick() を呼んで再開する', () => {
    for (const src of [venueInline, overlayPrep, twEntry, kickEntry, mxEntry, srEntry, wwEntry, tcEntry, ttEntry, abEntry]) {
      expect(src).toContain("addEventListener('pagehide'");
      expect(src).toContain("addEventListener('pageshow'");
      expect(src).toContain('persisted');
      expect(src).toMatch(/\.start\(\)/);
      expect(src).toMatch(/\.kick\(\)/);
    }
  });

  it('Twitch・Kick・mixch・SHOWROOM・ふわっち・ツイキャス・TikTok は pagehide で current=null にし、pageshow/表示復帰で同じ key でも再接続する', () => {
    for (const src of [twEntry, kickEntry, mxEntry, srEntry, wwEntry, tcEntry, ttEntry]) {
      expect(src).toContain("from '../../src/lib/pageWatchScheduler.js'");
      expect(src).toContain("from '../../src/lib/venuePaintSchedule.js'");
      expect(src).toContain('current = null;');
      expect(src).toContain("addEventListener('visibilitychange'");
      expect(src).toMatch(/if\s*\(\s*ev\?\.persisted\s*\|\|\s*!current\s*\)/);
    }
  });

  it('ABEMA も pageWatchScheduler へ移行し、pagehide の endStream 後に pageshow/表示復帰で再開する', () => {
    expect(abEntry).toContain("from '../../src/lib/pageWatchScheduler.js'");
    expect(abEntry).toContain("from '../../src/lib/venuePaintSchedule.js'");
    expect(abEntry).toContain("id: 'ab-watch'");
    expect(abEntry).toContain('endStream();');
    expect(abEntry).toMatch(/if\s*\(\s*ev\?\.persisted\s*\|\|\s*!streamKey\s*\)/);
    expect(abEntry).not.toMatch(/setInterval\(/);
  });

  it('Twitch の IRC と Hermes は共通スケジューラ＋shouldReconnectSilentSocket で無通信見張りを行う', () => {
    expect(twEntry).toContain('shouldReconnectSilentSocket');
    expect(twEntry).toContain('IRC_SILENCE_MS');
    expect(twEntry).toContain('ircLastAt = Date.now()');
    expect(twEntry).toContain("id: 'tw-socket-silence'");
    expect(twEntry).toContain('hiddenIntervalMs: 60_000');
  });
});

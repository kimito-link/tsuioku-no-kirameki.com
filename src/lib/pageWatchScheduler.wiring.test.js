import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = dirname(fileURLToPath(import.meta.url));
const venueInline = readFileSync(join(root, '../../extension-youtube/src/venue-inline-entry.js'), 'utf8');
const overlayPrep = readFileSync(join(root, '../../extension-youtube/src/ytVenueOverlayPrep.js'), 'utf8');
const twEntry = readFileSync(join(root, '../../extension-youtube/src/tw-content-entry.js'), 'utf8');
const kickEntry = readFileSync(join(root, '../../extension-youtube/src/kick-content-entry.js'), 'utf8');

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
});

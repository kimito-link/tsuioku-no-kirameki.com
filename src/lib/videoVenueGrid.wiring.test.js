import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(here, rel), 'utf8');

describe('video venue grid wiring (v0.1.2270・ライブの会場は変えない)', () => {
  const venue = read('../extension/venueVideoGrid.js');
  const bar = read('../extension/venueBar.js');
  const nicoEntry = read('../extension/content-entry.js');
  const ytEntry = read('../../extension-youtube/src/venue-inline-entry.js');

  it('nico live venue never gets the video board (grid code returns before touching the DOM)', () => {
    expect(nicoEntry).not.toMatch(/getVideoBoard/);
    expect(venue).toMatch(/if \(typeof deps\.getVideoBoard !== 'function'\) return;/);
    expect(venue).toMatch(/if \(typeof deps\.getVideoBoard === 'function'\) deps\.topBarList\.addEventListener\('click', onTopBarVideoJump, true\);/);
    expect(venue).toMatch(/if \(typeof deps\.getVideoBoard === 'function'\) deps\.seatsHost\.appendChild\(videoGridHost\);/);
    expect(bar).toMatch(/getVideoBoard: options\.getVideoBoard/);
  });

  it('only a video kind turns the grid on; a live kind turns it off', () => {
    expect(venue).toMatch(/if \(!deps\.isOpen\(\) \|\| \(kind && kind !== 'video'\)\)/);
    expect(venue).toMatch(/if \(kind !== 'video'\) return;/);
  });

  it('the YouTube/VOD venue passes a board reader that only returns video cards', () => {
    expect(ytEntry).toMatch(/getVideoBoard: videoBoardSource/);
    expect(ytEntry).toMatch(/card\.kind !== 'video'/);
    expect(ytEntry).toMatch(/card\.behavior\.contentKind === 'video'/);
  });

  it('no new timers or observers in the grid block', () => {
    const start = venue.indexOf('export function createVenueVideoGrid');
    const end = venue.length;
    const block = venue.slice(start, end);
    expect(start).toBeGreaterThan(0);
    expect(block).not.toMatch(/setTimeout|setInterval|requestAnimationFrame|MutationObserver|IntersectionObserver|ResizeObserver|fetch\(/);
  });
});

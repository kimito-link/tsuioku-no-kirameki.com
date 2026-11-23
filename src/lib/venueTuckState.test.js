// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { VENUE_COMPOSER_PASS_CLASS, VENUE_TUCK_CLASS, clearVenueComposerPass, venueToggleShouldUntuck } from './venueTuckState.js';

describe('venueToggleShouldUntuck', () => {
  it('js の tucked が true なら戻す(閉じない)', () => {
    expect(venueToggleShouldUntuck(true, null)).toBe(true);
  });

  it('印だけ残っているときも戻す(閉じない)', () => {
    const root = document.createElement('div');
    root.classList.add(VENUE_TUCK_CLASS);
    expect(venueToggleShouldUntuck(false, root)).toBe(true);
    root.classList.remove(VENUE_TUCK_CLASS);
    root.classList.add(VENUE_COMPOSER_PASS_CLASS);
    expect(venueToggleShouldUntuck(false, root)).toBe(true);
  });

  it('開いていて印も無いときは通常の開閉', () => {
    const root = document.createElement('div');
    expect(venueToggleShouldUntuck(false, root)).toBe(false);
  });
});

describe('clearVenueComposerPass', () => {
  it('送りの通過印だけ外す', () => {
    const root = document.createElement('div');
    root.classList.add(VENUE_COMPOSER_PASS_CLASS, VENUE_TUCK_CLASS);
    clearVenueComposerPass(root);
    expect(root.classList.contains(VENUE_COMPOSER_PASS_CLASS)).toBe(false);
    expect(root.classList.contains(VENUE_TUCK_CLASS)).toBe(true);
  });
});

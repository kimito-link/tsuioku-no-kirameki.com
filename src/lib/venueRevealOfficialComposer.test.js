// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { revealVenueOfficialComposer, withRevealedVenueOfficialComposer } from './venueRevealOfficialComposer.js';
import { VENUE_COMPOSER_PASS_CLASS, VENUE_TUCK_CLASS } from './venueTuckState.js';

function mountVenue(open = true, tucked = false) {
  document.body.replaceChildren();
  document.documentElement.classList.toggle('nlsb-venue-open', open);
  const root = document.createElement('div');
  root.id = 'nlsb-venue-root';
  if (tucked) root.classList.add(VENUE_TUCK_CLASS);
  document.body.append(root);
  return root;
}

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.classList.remove('nlsb-venue-open');
});

describe('revealVenueOfficialComposer', () => {
  it('会場が開いているとき、しまい印は付けず通過の印だけ付け、戻すと外れる', () => {
    const root = mountVenue(true);
    const restore = revealVenueOfficialComposer(document);
    expect(root.classList.contains(VENUE_TUCK_CLASS)).toBe(false);
    expect(root.classList.contains(VENUE_COMPOSER_PASS_CLASS)).toBe(true);
    restore();
    expect(root.classList.contains(VENUE_COMPOSER_PASS_CLASS)).toBe(false);
  });

  it('閉じていれば触らない', () => {
    const closed = mountVenue(false);
    const r1 = revealVenueOfficialComposer(document);
    expect(closed.classList.contains(VENUE_COMPOSER_PASS_CLASS)).toBe(false);
    expect(closed.classList.contains(VENUE_TUCK_CLASS)).toBe(false);
    r1();
  });

  it('前回の失敗で残ったしまい印は、送り始めに外す', () => {
    const tucked = mountVenue(true, true);
    const r2 = revealVenueOfficialComposer(document);
    expect(tucked.classList.contains(VENUE_TUCK_CLASS)).toBe(false);
    expect(tucked.classList.contains(VENUE_COMPOSER_PASS_CLASS)).toBe(true);
    r2();
    expect(tucked.classList.contains(VENUE_COMPOSER_PASS_CLASS)).toBe(false);
    expect(tucked.classList.contains(VENUE_TUCK_CLASS)).toBe(false);
  });

  it('入れ子で呼ばれても、一番外側の戻しで通過の印を外す', () => {
    const root = mountVenue(true);
    const outer = revealVenueOfficialComposer(document);
    const inner = revealVenueOfficialComposer(document);
    expect(root.classList.contains(VENUE_COMPOSER_PASS_CLASS)).toBe(true);
    inner();
    expect(root.classList.contains(VENUE_COMPOSER_PASS_CLASS)).toBe(true);
    outer();
    expect(root.classList.contains(VENUE_COMPOSER_PASS_CLASS)).toBe(false);
  });

  it('送り終わったら必ず戻す(途中で失敗しても)。会場はしまったままにしない', async () => {
    const root = mountVenue(true);
    await expect(
      withRevealedVenueOfficialComposer(document, async () => {
        expect(root.classList.contains(VENUE_TUCK_CLASS)).toBe(false);
        expect(root.classList.contains(VENUE_COMPOSER_PASS_CLASS)).toBe(true);
        throw new Error('send-fail');
      }),
    ).rejects.toThrow('send-fail');
    expect(root.classList.contains(VENUE_COMPOSER_PASS_CLASS)).toBe(false);
    expect(root.classList.contains(VENUE_TUCK_CLASS)).toBe(false);
  });
});

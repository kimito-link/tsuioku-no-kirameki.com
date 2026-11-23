// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { revealVenueOfficialComposer, withRevealedVenueOfficialComposer } from './venueRevealOfficialComposer.js';

function mountVenue(open = true, tucked = false) {
  document.body.replaceChildren();
  document.documentElement.classList.toggle('nlsb-venue-open', open);
  const root = document.createElement('div');
  root.id = 'nlsb-venue-root';
  if (tucked) root.classList.add('nlsb-is-tucked');
  document.body.append(root);
  return root;
}

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.classList.remove('nlsb-venue-open');
});

describe('revealVenueOfficialComposer', () => {
  it('会場が開いているときだけ nlsb-is-tucked を付け、戻すと外れる', () => {
    const root = mountVenue(true);
    const restore = revealVenueOfficialComposer(document);
    expect(root.classList.contains('nlsb-is-tucked')).toBe(true);
    restore();
    expect(root.classList.contains('nlsb-is-tucked')).toBe(false);
  });

  it('閉じていれば触らない', () => {
    const closed = mountVenue(false);
    const r1 = revealVenueOfficialComposer(document);
    expect(closed.classList.contains('nlsb-is-tucked')).toBe(false);
    r1();
  });

  it('前回の失敗で残った印は、戻す関数が外す', () => {
    const tucked = mountVenue(true, true);
    const r2 = revealVenueOfficialComposer(document);
    expect(tucked.classList.contains('nlsb-is-tucked')).toBe(true);
    r2();
    expect(tucked.classList.contains('nlsb-is-tucked')).toBe(false);
  });

  it('入れ子でしまっても、一番外側の戻しで印を外す', () => {
    const root = mountVenue(true);
    const outer = revealVenueOfficialComposer(document);
    const inner = revealVenueOfficialComposer(document);
    expect(root.classList.contains('nlsb-is-tucked')).toBe(true);
    inner();
    expect(root.classList.contains('nlsb-is-tucked')).toBe(true);
    outer();
    expect(root.classList.contains('nlsb-is-tucked')).toBe(false);
  });

  it('送り終わったら必ず戻す(途中で失敗しても)', async () => {
    const root = mountVenue(true);
    await expect(
      withRevealedVenueOfficialComposer(document, async () => {
        expect(root.classList.contains('nlsb-is-tucked')).toBe(true);
        throw new Error('send-fail');
      }),
    ).rejects.toThrow('send-fail');
    expect(root.classList.contains('nlsb-is-tucked')).toBe(false);
  });
});

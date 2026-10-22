import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PHONE_HIDDEN_SELECTORS, keepLaneCellAsLink } from '../../app/live-view-phone-fit.js';

const liveView = readFileSync(new URL('../../app/live-view.js', import.meta.url), 'utf8');
const fit = readFileSync(new URL('../../app/live-view-phone-fit.js', import.meta.url), 'utf8');

describe('配線: スマホで働かないボタンの片付け(v0.1.1741)', () => {
  it('★popup を起動したあとに付ける(閲覧は止めない)', () => {
    expect(liveView).toContain('try { mountPhoneFit(); } catch');
  });
  it('★実機で無反応だった拡張専用のボタンを隠す・スマホで働くもの(送信・読み上げ)は隠さない', () => {
    for (const id of ['#exportJson', '#captureScreenshot', '#reloadWatchTabBtn', '#openComeviewBtn', '#nlPlacementQuickbar', '#nlPopupSettings']) {
      expect(PHONE_HIDDEN_SELECTORS).toContain(id);
    }
    expect(PHONE_HIDDEN_SELECTORS).not.toContain('#postCommentBtn');
    expect(PHONE_HIDDEN_SELECTORS).not.toContain('#openComeviewVoiceBtn');
  });
  it('★応援者アイコンは window の捕捉段階で受け、popup の「別窓で開く」へ届かせない(リンクの既定動作は止めない)', () => {
    expect(fit).toContain("window.addEventListener('click', keepLaneCellAsLink, true);");
    expect(fit).not.toMatch(/preventDefault/);
  });
});

describe('keepLaneCellAsLink', () => {
  const ev = (cell) => ({ target: { closest: () => cell }, stopPropagation: vi.fn() });
  it('リンクのアイコンだけ止める', () => {
    vi.stubGlobal('Element', Object);
    const a = ev({});
    expect(keepLaneCellAsLink(/** @type {any} */ (a))).toBe(true);
    expect(a.stopPropagation).toHaveBeenCalled();
    const none = ev(null);
    expect(keepLaneCellAsLink(/** @type {any} */ (none))).toBe(false);
    expect(none.stopPropagation).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

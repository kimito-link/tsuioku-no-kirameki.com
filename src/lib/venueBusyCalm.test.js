import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { applyVenueBusyCalm, isVenueBusyForCalm, VENUE_BUSY_CALM_CSS, VENUE_BUSY_CALM_ATTR, VENUE_BUSY_CALM_HEAT } from './venueBusyCalm.js';
import { heatLevelToLabel } from './venueHeat.js';

describe('venueBusyCalm', () => {
  it('静か・おだやかでは止めない(今までどおり動く)', () => {
    expect(isVenueBusyForCalm(0)).toBe(false);
    expect(isVenueBusyForCalm(0.3)).toBe(false);
    expect(isVenueBusyForCalm(NaN)).toBe(false);
    expect(isVenueBusyForCalm(/** @type {any} */ (undefined))).toBe(false);
  });
  it('盛り上がり以上で止める(しきいは熱量ラベルの「盛り上がり」の下端と同じ)', () => {
    expect(heatLevelToLabel(VENUE_BUSY_CALM_HEAT)).toBe('盛り上がり');
    expect(heatLevelToLabel(VENUE_BUSY_CALM_HEAT - 0.01)).toBe('おだやか');
    expect(isVenueBusyForCalm(0.45)).toBe(true);
    expect(isVenueBusyForCalm(1)).toBe(true);
  });
  it('CSS は印の付いた stage の中だけ・動きだけを止める(色や枠は書かない)', () => {
    expect(VENUE_BUSY_CALM_CSS).toContain(`.nlsb-stage[${VENUE_BUSY_CALM_ATTR}]`);
    expect(VENUE_BUSY_CALM_CSS).not.toMatch(/box-shadow|filter|opacity|display/);
  });
  it('会場がこの CSS を入れ、熱量の書き込みと同じ場所で印を付け外しする(新しいタイマーなし)', () => {
    const src = fs.readFileSync(new URL('../extension/venueBar.js', import.meta.url), 'utf8');
    expect(src).toMatch(/VENUE_CSS \+ VENUE_STAT_STRIP_CSS \+ VENUE_BUSY_CALM_CSS/);
    const i = src.indexOf('const applyVenueHeat');
    const body = src.slice(i, src.indexOf('};', i));
    expect(body).toContain('applyVenueBusyCalm(stage, level)');
  });
  it('印は値が変わるときだけ書く(同じなら DOM に触らない)', () => {
    const attrs = new Set();
    let writes = 0;
    const stage = { hasAttribute: (n) => attrs.has(n), toggleAttribute: (n, f) => { writes += 1; if (f) attrs.add(n); else attrs.delete(n); return !!f; } };
    applyVenueBusyCalm(stage, 0.9);
    applyVenueBusyCalm(stage, 0.8);
    expect(writes).toBe(1);
    expect(attrs.has(VENUE_BUSY_CALM_ATTR)).toBe(true);
    applyVenueBusyCalm(stage, 0.1);
    applyVenueBusyCalm(stage, 0.2);
    expect(writes).toBe(2);
    expect(attrs.has(VENUE_BUSY_CALM_ATTR)).toBe(false);
    applyVenueBusyCalm(null, 1);
  });
});

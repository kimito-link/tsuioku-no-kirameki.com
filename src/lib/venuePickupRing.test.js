import { describe, expect, it } from 'vitest';
import { PICKUP_RING_MAX, PICKUP_RING_MAX_AGE_MS, appendPickupRows } from './venuePickupRing.js';
import { pickTickerHighlightEntry } from './pickTickerHighlight.js';
import { buildVenuePickupView } from './venuePickupBanner.js';

/** 2026-10-17: ピックアップ枠の入力リング。枠は表示行ではなく、届いた発言のリングから選ぶ(表示行は鏡由来で本文が空=枠が案内文のままだった)。 */
const NOW = 1_700_000_000_000;
const sp = (key, text, userId = 'u1') => ({ key, userId, name: 'n' + userId, text });

describe('appendPickupRows', () => {
  it('★新着の発言を足す(本文・userId・name・時刻)', () => {
    const r = appendPickupRows([], [sp('k1', 'こんばんは今日も楽しいね')], NOW);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ key: 'k1', userId: 'u1', name: 'nu1', text: 'こんばんは今日も楽しいね', capturedAt: NOW, kind: 'comment' });
  });
  it('本文が空の発言は足さない・同じ key は二重に足さない', () => {
    const r = appendPickupRows([], [sp('k1', 'あいうえお'), sp('k2', '   '), sp('k1', 'あいうえお')], NOW);
    expect(r.map((x) => x.key)).toEqual(['k1']);
    expect(appendPickupRows(r, [sp('k1', 'あいうえお')], NOW + 5)).toHaveLength(1);
  });
  it('★古い行(最大寿命超)は落とし、上限件数で古い順に切る', () => {
    const old = appendPickupRows([], [sp('o', '古いコメントです')], NOW - PICKUP_RING_MAX_AGE_MS - 1);
    expect(appendPickupRows(old, [sp('n', '新しいコメントです')], NOW).map((x) => x.key)).toEqual(['n']);
    let ring = [];
    for (let i = 0; i < PICKUP_RING_MAX + 7; i += 1) ring = appendPickupRows(ring, [sp('k' + i, 'コメント' + i)], NOW + i);
    expect(ring).toHaveLength(PICKUP_RING_MAX);
    expect(ring[ring.length - 1].key).toBe('k' + (PICKUP_RING_MAX + 6));
  });
  it('入力を破壊しない・null/不正入力でも落ちない', () => {
    const ring = [];
    appendPickupRows(ring, [sp('k', 'abcdef')], NOW);
    expect(ring).toEqual([]);
    expect(appendPickupRows(null, null, NOW)).toEqual([]);
  });
  it('★流れたコメントが、枠に出る(案内文でなく本文)/リングが空なら案内文のまま', () => {
    const ring = appendPickupRows([], [sp('k1', 'ナイスプレイですね', 'u2')], NOW - 1000);
    const view = buildVenuePickupView(pickTickerHighlightEntry(ring, NOW));
    expect(view.empty).toBe(false);
    expect(view.text).toBe('ナイスプレイですね');
    expect(buildVenuePickupView(pickTickerHighlightEntry([], NOW)).empty).toBe(true);
  });
});

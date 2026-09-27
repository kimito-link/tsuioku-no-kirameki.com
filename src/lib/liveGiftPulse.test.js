import { describe, expect, it } from 'vitest';
import {
  EMPTY_PULSE,
  PULSE_MAX_GAP_MS,
  createGiftPulseRegistry,
  diffGiftRows,
  formatPtDelta,
  pulseRowKey,
  spanText
} from './liveGiftPulse.js';
import { tierForGiftDeltaPoints } from './giftDeltaFallback.js';

const row = (uid, point, name = uid || '匿名') => ({
  rank: 1,
  name,
  point,
  avatar: '',
  url: uid ? `https://www.nicovideo.jp/user/${uid}` : '',
  uid
});

describe('liveGiftPulse', () => {
  it('1. 初回は差分を出さない', () => {
    const registry = createGiftPulseRegistry();
    registry.begin();
    expect(registry.pulseFor('lv1', [row('101', 100)], 1_700_000_000_000)).toBe(EMPTY_PULSE);
  });

  it('2. 同じ capturedAt の再送は同じ result オブジェクトを返す', () => {
    const registry = createGiftPulseRegistry();
    registry.begin();
    registry.pulseFor('lv1', [row('101', 100)], 1_700_000_000_000);
    const first = registry.pulseFor('lv1', [row('101', 150)], 1_700_000_000_000);
    const second = registry.pulseFor('lv1', [row('101', 200)], 1_700_000_000_000);
    expect(second).toBe(first);
  });

  it('3. 増えた行だけを載せ、tier は共有正本と一致する', () => {
    const registry = createGiftPulseRegistry();
    registry.begin();
    registry.pulseFor('lv1', [row('101', 100), row('102', 500), row('103', 10)], 1_700_000_000_000);
    const pulse = registry.pulseFor(
      'lv1',
      [row('101', 850), row('102', 450), row('103', 10)],
      1_700_000_060_000
    );
    expect(pulse.byKey.get(pulseRowKey(row('101', 850)))).toEqual({
      delta: 750,
      tier: tierForGiftDeltaPoints(750)
    });
    expect(pulse.byKey.has('u:102')).toBe(false);
    expect(pulse.byKey.has('u:103')).toBe(false);
    expect(pulse.sum).toBe(750);
  });

  it('4. uid の無い匿名行は追跡しない', () => {
    const registry = createGiftPulseRegistry();
    registry.begin();
    registry.pulseFor('lv1', [row('', 10)], 1_700_000_000_000);
    const pulse = registry.pulseFor('lv1', [row('', 100)], 1_700_000_060_000);
    expect(pulse).toBe(EMPTY_PULSE);
    expect(pulseRowKey(row('', 100))).toBe('');
  });

  it('5. 前回いなかった uid は全額を増分にしない', () => {
    const previous = new Map([['u:101', 100]]);
    const pulse = diffGiftRows(previous, [row('101', 120), row('202', 900)], 60_000);
    expect(pulse.byKey.has('u:101')).toBe(true);
    expect(pulse.byKey.has('u:202')).toBe(false);
    expect(pulse.sum).toBe(20);
  });

  it('6. top と全体 tier は最大の単一差分で決める', () => {
    const pulse = diffGiftRows(
      new Map([['u:101', 0], ['u:102', 0]]),
      [row('101', 100), row('102', 1_000)],
      60_000
    );
    expect(pulse.sum).toBe(1_100);
    expect(pulse.top).toEqual({ row: row('102', 1_000), delta: 1_000 });
    expect(pulse.tier).toBe(tierForGiftDeltaPoints(1_000));
  });

  it('7. 15分超は差分を出さず、その標本を次の起点にする', () => {
    const registry = createGiftPulseRegistry();
    registry.begin();
    registry.pulseFor('lv1', [row('101', 100)], 1_700_000_000_000);
    const stale = registry.pulseFor('lv1', [row('101', 500)], 1_700_000_000_000 + PULSE_MAX_GAP_MS + 1);
    expect(stale).toBe(EMPTY_PULSE);
    const next = registry.pulseFor('lv1', [row('101', 525)], 1_700_000_000_000 + PULSE_MAX_GAP_MS + 60_001);
    expect(next.sum).toBe(25);
    expect(next.spanMs).toBe(60_000);
  });

  it('8. end は触られなかった配信を捨て、表示文言を整形する', () => {
    const registry = createGiftPulseRegistry();
    registry.begin();
    registry.pulseFor('lv1', [row('101', 100)], 1_700_000_000_000);
    registry.pulseFor('lv2', [row('202', 100)], 1_700_000_000_000);
    registry.end();
    expect(registry.size()).toBe(2);

    registry.begin();
    registry.pulseFor('lv1', [row('101', 100)], 1_700_000_000_000);
    registry.end();
    expect(registry.size()).toBe(1);
    expect(formatPtDelta(1_200)).toBe('+1,200pt');
    expect(formatPtDelta(0)).toBe('');
    expect(spanText(62_000)).toBe('直近 62 秒');
    expect(spanText(180_000)).toBe('直近 3 分');
  });
});

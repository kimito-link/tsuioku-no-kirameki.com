import { describe, it, expect } from 'vitest';
import {
  isNorthStarLaneWaitingState,
  getNorthStarWaitFootnote,
  getNorthStarWaitRotationMessages,
  buildNorthStarLaneWaitingShellHtml,
  NORTH_STAR_WAITING_STATES
} from './northStarLaneWaitingUi.js';

describe('northStarLaneWaitingUi', () => {
  it('NORTH_STAR_WAITING_STATES に not_yet / iframe_unrendered', () => {
    expect(NORTH_STAR_WAITING_STATES.has('not_yet')).toBe(true);
    expect(NORTH_STAR_WAITING_STATES.has('iframe_unrendered')).toBe(true);
    expect(NORTH_STAR_WAITING_STATES.has('missing')).toBe(false);
  });

  it('isNorthStarLaneWaitingState', () => {
    expect(isNorthStarLaneWaitingState('not_yet')).toBe(true);
    expect(isNorthStarLaneWaitingState('iframe_unrendered')).toBe(true);
    expect(isNorthStarLaneWaitingState('no_event')).toBe(false);
  });

  it('getNorthStarWaitFootnote はレーンと state で変える', () => {
    expect(getNorthStarWaitFootnote('contributionRanking', 'not_yet')).toContain('貢献度');
    expect(getNorthStarWaitFootnote('programPoints', 'not_yet')).toContain('番組累計');
    expect(getNorthStarWaitFootnote('contributionRanking', 'iframe_unrendered')).toContain(
      '貢献度'
    );
    expect(getNorthStarWaitFootnote('giftHistory', 'iframe_unrendered')).toContain('ギフト');
  });

  it('getNorthStarWaitRotationMessages は各状態で3件以上', () => {
    const a = getNorthStarWaitRotationMessages('contributionRanking', 'iframe_unrendered');
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(a[0].badge.length).toBeGreaterThan(0);
    expect(a[0].line.length).toBeGreaterThan(0);
    const b = getNorthStarWaitRotationMessages('programPoints', 'not_yet');
    expect(b.length).toBeGreaterThanOrEqual(3);
  });

  it('buildNorthStarLaneWaitingShellHtml は data 属性と待機 UI 断片を含む', () => {
    const h = buildNorthStarLaneWaitingShellHtml('contributionRanking');
    expect(h).toContain('data-lane-id="contributionRanking"');
    expect(h).toContain('nl-north-star-lane-wait__short');
    expect(h).not.toContain('<script');
  });
});

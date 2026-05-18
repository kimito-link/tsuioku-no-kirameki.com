import { describe, it, expect } from 'vitest';
import { shouldShowNorthStarLane } from './northStarLaneVisibility.js';

describe('shouldShowNorthStarLane', () => {
  const ALL_STATES = [
    'ok',
    'no_event',
    'no_program_gift',
    'iframe_unrendered',
    'fetch_error',
    'not_yet',
    'missing'
  ];

  it('コア2レーンは全 state で常に表示（取得可否に関わらず常設）', () => {
    for (const core of ['contributionRanking', 'giftHistory']) {
      for (const s of ALL_STATES) {
        expect(shouldShowNorthStarLane(core, s)).toBe(true);
      }
      // state 不明・空でもコアは常設
      expect(shouldShowNorthStarLane(core, '')).toBe(true);
      expect(shouldShowNorthStarLane(core, undefined)).toBe(true);
    }
  });

  it('補助レーンは ok / not_yet のみ表示', () => {
    for (const aux of ['programPoints', 'adRanking', 'eventScore', 'eventRank']) {
      expect(shouldShowNorthStarLane(aux, 'ok')).toBe(true);
      expect(shouldShowNorthStarLane(aux, 'not_yet')).toBe(true);
    }
  });

  it('2026-05-19 撤回: event_present_unscrapable は補助レーンで非表示（空 placeholder のスペース無駄を排除）', () => {
    for (const aux of ['eventScore', 'eventRank', 'programPoints', 'adRanking']) {
      expect(shouldShowNorthStarLane(aux, 'event_present_unscrapable')).toBe(
        false
      );
    }
  });

  it('event_present_unscrapable でもコア2レーンは常設（核は隠さない）', () => {
    for (const core of ['contributionRanking', 'giftHistory']) {
      expect(shouldShowNorthStarLane(core, 'event_present_unscrapable')).toBe(
        true
      );
    }
  });

  it('補助レーンは不参加/空/取得不能を完全非表示', () => {
    for (const aux of ['programPoints', 'adRanking', 'eventScore', 'eventRank']) {
      for (const s of [
        'no_event',
        'no_program_gift',
        'iframe_unrendered',
        'fetch_error',
        'missing'
      ]) {
        expect(shouldShowNorthStarLane(aux, s)).toBe(false);
      }
      expect(shouldShowNorthStarLane(aux, '')).toBe(false);
      expect(shouldShowNorthStarLane(aux, undefined)).toBe(false);
    }
  });

  it('イベント不参加（no_event）でイベント系レーンは非表示＝スペース節約', () => {
    expect(shouldShowNorthStarLane('eventScore', 'no_event')).toBe(false);
    expect(shouldShowNorthStarLane('eventRank', 'no_event')).toBe(false);
  });

  it('lane 不明は安全側＝隠さない（true）', () => {
    expect(shouldShowNorthStarLane('', 'missing')).toBe(true);
    expect(shouldShowNorthStarLane(null, 'no_event')).toBe(true);
    expect(shouldShowNorthStarLane(undefined, 'ok')).toBe(true);
  });
});

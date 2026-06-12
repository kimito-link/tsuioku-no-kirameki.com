import { describe, expect, it } from 'vitest';
import { shouldRefreshSupportTimeline } from './supportTimelineGuard.js';

describe('shouldRefreshSupportTimeline', () => {
  it('closed action popup returns false (skip heavy read)', () => {
    expect(
      shouldRefreshSupportTimeline({
        detailsOpen: false,
        isStandaloneWindow: false
      })
    ).toBe(false);
  });

  it('open action popup returns true', () => {
    expect(
      shouldRefreshSupportTimeline({
        detailsOpen: true,
        isStandaloneWindow: false
      })
    ).toBe(true);
  });

  it('standalone window default-open returns true', () => {
    expect(
      shouldRefreshSupportTimeline({
        isStandaloneWindow: true
      })
    ).toBe(true);
  });

  it('explicitly closed standalone returns false', () => {
    expect(
      shouldRefreshSupportTimeline({
        detailsOpen: false,
        isStandaloneWindow: true
      })
    ).toBe(false);
  });
});

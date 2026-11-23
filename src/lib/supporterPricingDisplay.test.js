import { describe, expect, it } from 'vitest';
import { TRIAL_MS } from './supporterLicense.js';
import {
  SUPPORTER_PAGE_TRIAL_MS,
  SUPPORTER_PRICE_YEN,
  formatJpDate,
  formatPriceLabel,
  formatTrialBillingNotice,
  formatYen,
  trialDaysFromMs,
  trialEndMs
} from '../../app/supporter-pricing.js';

describe('supporter pricing display', () => {
  it('keeps the page trial length equal to supporterLicense.TRIAL_MS', () => {
    expect(SUPPORTER_PAGE_TRIAL_MS).toBe(TRIAL_MS);
    expect(trialDaysFromMs()).toBe(14);
    expect(trialDaysFromMs(TRIAL_MS)).toBe(14);
  });

  it('uses the existing tax-included prices and does not invent new amounts', () => {
    expect(SUPPORTER_PRICE_YEN).toEqual({ monthly: 980, yearly: 9800 });
    expect(formatYen(980)).toBe('980円');
    expect(formatYen(9800)).toBe('9,800円');
    expect(formatPriceLabel('monthly')).toBe('月額 980円（税込）');
    expect(formatPriceLabel('yearly')).toBe('年額 9,800円（税込）');
  });

  it('ends the trial at firstSeen + TRIAL_MS, or now + TRIAL_MS when firstSeen is missing', () => {
    const t0 = Date.UTC(2026, 10, 23, 3, 44, 0);
    expect(trialEndMs(t0, t0 + 1000, TRIAL_MS)).toBe(t0 + TRIAL_MS);
    expect(trialEndMs(null, t0, TRIAL_MS)).toBe(t0 + TRIAL_MS);
    expect(trialEndMs(undefined, t0, TRIAL_MS)).toBe(t0 + TRIAL_MS);
  });

  it('states the trial end date in JST and both plan amounts, without implying automatic charge', () => {
    const nowMs = Date.UTC(2026, 10, 23, 3, 0, 0); // 2026-11-23 12:00 JST
    const text = formatTrialBillingNotice({ nowMs, timeZone: 'Asia/Tokyo' });
    const endDate = formatJpDate(nowMs + TRIAL_MS, 'Asia/Tokyo');
    expect(endDate).toBe('2026年12月7日');
    expect(text).toContain('14日間');
    expect(text).toContain('今日初めて開いた場合、お試しは2026年12月7日までです。');
    expect(text).toContain('月額 980円（税込）');
    expect(text).toContain('年額 9,800円（税込）');
    expect(text).toContain('支払いは、サポーターを申し込んだときです。');
    expect(text).not.toMatch(/今すぐ|限定|急い|お急ぎ|見逃|損を/);
  });

  it('uses the recorded first-open day when one is provided', () => {
    const firstSeenAtMs = Date.UTC(2026, 10, 20, 3, 0, 0);
    const nowMs = Date.UTC(2026, 10, 23, 3, 0, 0);
    const text = formatTrialBillingNotice({ firstSeenAtMs, nowMs, timeZone: 'Asia/Tokyo' });
    expect(text).toContain('お試しは2026年12月4日までです。');
    expect(text).not.toContain('今日初めて開いた場合');
  });
});

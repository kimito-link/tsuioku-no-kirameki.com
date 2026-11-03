import { describe, it, expect } from 'vitest';
import { parseYtChatClock, ytPostedAtFromClock } from './ytPostedAt.js';

describe('parseYtChatClock', () => {
  it('reads 12h and 24h clocks', () => {
    expect(parseYtChatClock('12:25 AM')).toEqual({ h: 0, m: 25 });
    expect(parseYtChatClock('12:05 PM')).toEqual({ h: 12, m: 5 });
    expect(parseYtChatClock('11:59 PM')).toEqual({ h: 23, m: 59 });
    expect(parseYtChatClock('午前0:25')).toEqual({ h: 0, m: 25 });
    expect(parseYtChatClock('午後3:07')).toEqual({ h: 15, m: 7 });
    expect(parseYtChatClock('0:25')).toEqual({ h: 0, m: 25 });
    expect(parseYtChatClock('')).toBeNull();
    expect(parseYtChatClock('abc')).toBeNull();
  });
});

describe('ytPostedAtFromClock', () => {
  const rec = new Date(2026, 10, 4, 0, 27, 40).getTime();
  it('keeps recordedAt when the clock matches it', () => {
    expect(ytPostedAtFromClock('12:27 AM', rec)).toBe(rec);
  });
  it('goes back to the shown minute when recorded later', () => {
    expect(ytPostedAtFromClock('12:10 AM', rec)).toBe(new Date(2026, 10, 4, 0, 10, 0).getTime());
  });
  it('crosses midnight', () => {
    expect(ytPostedAtFromClock('11:50 PM', rec)).toBe(new Date(2026, 10, 3, 23, 50, 0).getTime());
  });
  it('falls back when unreadable', () => {
    expect(ytPostedAtFromClock('', rec)).toBe(rec);
  });
});
